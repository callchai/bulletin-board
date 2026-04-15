from flask import Flask, render_template, request, jsonify
from google.cloud import firestore, storage
from datetime import datetime, timezone
import threading

app = Flask(__name__)
db = firestore.Client()
BUCKET_NAME = 'bulletin-board-drawings'


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/posts', methods=['GET'])
def get_posts():
    """
    Fetches posts from Firestore.

    TODO:
    Remember to test performance and index so it updates 
    posts in actual order of creation, not retrieve time.
    """
    posts = db.collection('posts').order_by('timestamp').stream()
    result = []
    z = 1
    for p in posts:
        d = p.to_dict()
        d['id'] = p.id
        d['score'] = d.get('score', 0)
        d['denounced'] = d.get('denounced', False)
        d['zIndex'] = z
        z += 1
        ts = d.pop('timestamp', None)
        if ts:
            d['postedAt'] = int(ts.timestamp() * 1000)
        result.append(d)
    response = jsonify(result)
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/drawing-upload', methods=['POST'])
def drawing_upload():
    """Holy nuts this was a pain"""
    import uuid
    filename = f"drawing-{uuid.uuid4().hex}.png"
    blob_data = request.data
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(filename)
    blob.upload_from_string(blob_data, content_type='image/png')
    public_url = f'/api/drawing/{filename}'
    return jsonify({'publicUrl': public_url}), 200

@app.route('/api/drawing/<filename>', methods=['GET'])
def serve_drawing(filename):
    """
    Had to actual read documentation https://docs.cloud.google.com/appengine/docs/flexible/using-cloud-storage
    And for flask https://flask.palletsprojects.com/en/stable/api/#flask.send_file
    ts pmo
    """
    from flask import send_file
    import io
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(filename)
    data = blob.download_as_bytes()
    return send_file(io.BytesIO(data), mimetype='image/png')

@app.route('/api/posts', methods=['POST'])
def add_post():
    data = request.get_json()
    doc_ref = db.collection('posts').document()
    post = {
        'text':      data.get('text', ''),
        'author':    data['author'],
        'color':     data['color'],
        'x':         data['x'],
        'y':         data['y'],
        'type':      data.get('type', 'text'),
        'imageUrl':  data.get('imageUrl', None),
        'caption':   data.get('caption', ''),
        'timestamp': firestore.SERVER_TIMESTAMP,
        'fileExt': data.get('fileExt', None),
    }
    doc_ref.set(post)
    return jsonify({'id': doc_ref.id}), 201

# This is for the clock
@app.route('/api/board-start', methods=['GET'])
def get_board_start():
    doc = db.collection('meta').document('board').get()
    if doc.exists:
        d = doc.to_dict()
        ts = d.get('createdAt')
        generation = d.get('generation', 0)
        if ts is None:
            now = datetime.now(timezone.utc)
            db.collection('meta').document('board').set({'createdAt': now, 'generation': 0})
            return jsonify({'startMs': int(now.timestamp() * 1000), 'generation': 0})
        return jsonify({'startMs': int(ts.timestamp() * 1000), 'generation': generation})
    else:
        now = datetime.now(timezone.utc)
        db.collection('meta').document('board').set({'createdAt': now, 'generation': 0})
        return jsonify({'startMs': int(now.timestamp() * 1000), 'generation': 0})
    
@app.route('/api/posts/<post_id>/vote', methods=['POST'])
def vote_post(post_id):
    data = request.get_json()
    direction = data.get('direction')
    voter = data.get('voter')
    if direction not in ('up', 'down') or not voter:
        return jsonify({'error': 'invalid'}), 400
    ref = db.collection('posts').document(post_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify({'error': 'not found'}), 404
    post = doc.to_dict()
    votes = post.get('votes', {})
    prev = votes.get(voter)
    if prev == direction:
        del votes[voter]
    else:
        votes[voter] = direction
    score = sum(1 if v == 'up' else -1 for v in votes.values())
    ref.update({'votes': votes, 'score': score})
    return jsonify({'score': score, 'userVote': votes.get(voter, None)})

# The follow is for the Trial feature
# Calls from firestore
@app.route('/api/trials/active', methods=['GET'])
def get_active_trial():
    trials = db.collection('trials').where('status', 'in', ['pending', 'active']).stream()
    for t in trials:
        d = t.to_dict()
        d['id'] = t.id
        for field in ('startedAt', 'concludedAt'):
            if d.get(field):
                d[field] = int(d[field].timestamp() * 1000)
        return jsonify(d)
    return jsonify(None)

@app.route('/api/trials', methods=['POST'])
def start_trial():
    existing = list(db.collection('trials').where('status', 'in', ['pending', 'active']).stream())
    if existing:
        return jsonify({'queued': True}), 200

    data = request.get_json()
    post_id = data.get('postId')
    post_ref = db.collection('posts').document(post_id)
    post_doc = post_ref.get()
    if not post_doc.exists:
        return jsonify({'error': 'post not found'}), 404

    post_data = post_doc.to_dict()
    accused = post_data.get('author')

    banned_doc = db.collection('banned').document(accused).get()
    if banned_doc.exists:
        return jsonify({'already_banned': True}), 200

    same = list(db.collection('trials').where('postId', '==', post_id).stream())
    if same:
        return jsonify({'duplicate': True}), 200

    trial_ref = db.collection('trials').document()
    trial_ref.set({
        'postId': post_id,
        'accused': accused,
        'postData': {
            'text': post_data.get('text', ''),
            'type': post_data.get('type', 'text'),
            'imageUrl': post_data.get('imageUrl', None),
            'caption': post_data.get('caption', ''),
            'color': post_data.get('color', {}),
            'author': accused,
            'score': post_data.get('score', 0),
        },
        'status': 'pending',
        'defense': None,
        'votes': {},
        'startedAt': firestore.SERVER_TIMESTAMP,
        'concludedAt': None,
        'verdict': None,
    })
    return jsonify({'id': trial_ref.id}), 201

@app.route('/api/trials/<trial_id>/defense', methods=['POST'])
def submit_defense(trial_id):
    data = request.get_json()
    defense = data.get('defense', '').strip()
    if len(defense.split()) > 100:
        return jsonify({'error': 'Too many words'}), 400
    ref = db.collection('trials').document(trial_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify({'error': 'not found'}), 404
    d = doc.to_dict()
    if d['status'] != 'pending':
        return jsonify({'error': 'trial not pending'}), 400
    ref.update({
        'defense': defense if defense else '(The accused offers no defense.)',
        'status': 'active',
        'startedAt': firestore.SERVER_TIMESTAMP,
    })
    return jsonify({'ok': True})

@app.route('/api/trials/<trial_id>/vote', methods=['POST'])
def vote_trial(trial_id):
    data = request.get_json()
    voter = data.get('voter')
    direction = data.get('direction')
    if direction not in ('forgive', 'banish') or not voter:
        return jsonify({'error': 'invalid'}), 400
    ref = db.collection('trials').document(trial_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify({'error': 'not found'}), 404
    d = doc.to_dict()
    if d['status'] != 'active':
        return jsonify({'error': 'trial not active'}), 400
    if voter == d['accused']:
        return jsonify({'error': 'accused cannot vote'}), 403
    votes = d.get('votes', {})
    if votes.get(voter) == direction:
        del votes[voter] 
    else:
        votes[voter] = direction
    ref.update({'votes': votes})
    forgive = sum(1 for v in votes.values() if v == 'forgive')
    banish  = sum(1 for v in votes.values() if v == 'banish')
    return jsonify({'forgive': forgive, 'banish': banish, 'userVote': votes.get(voter, None)})

@app.route('/api/trials/<trial_id>/conclude', methods=['POST'])
def conclude_trial(trial_id):
    ref = db.collection('trials').document(trial_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify({'error': 'not found'}), 404
    d = doc.to_dict()
    if d['status'] == 'concluded':
        return jsonify({'verdict': d['verdict']})

    votes = d.get('votes', {})
    forgive = sum(1 for v in votes.values() if v == 'forgive')
    banish  = sum(1 for v in votes.values() if v == 'banish')

    if forgive > banish:
        verdict = 'forgiven'
    elif banish > forgive:
        verdict = 'banished'
    else:
        verdict = 'exiled'

    accused = d['accused']
    from datetime import timedelta

    if verdict == 'banished':
        db.collection('banned').document(accused).set({
            'until': None,
            'reason': 'banished',
            'trialId': trial_id,
        })
        _denounce_posts(accused)

    elif verdict == 'exiled':
        exile_until = datetime.now(timezone.utc) + timedelta(minutes=5)
        db.collection('banned').document(accused).set({
            'until': exile_until,
            'reason': 'exiled',
            'trialId': trial_id,
        })
        _denounce_posts(accused)

    ref.update({
        'status': 'concluded',
        'verdict': verdict,
        'concludedAt': firestore.SERVER_TIMESTAMP,
    })
    return jsonify({'verdict': verdict, 'forgive': forgive, 'banish': banish})

def _denounce_posts(author):
    posts = db.collection('posts').where('author', '==', author).stream()
    batch = db.batch()
    for p in posts:
        batch.update(p.reference, {'denounced': True})
    batch.commit()

@app.route('/api/banned/<username>', methods=['GET'])
def check_banned(username):
    doc = db.collection('banned').document(username).get()
    if not doc.exists:
        return jsonify({'banned': False})
    d = doc.to_dict()
    until = d.get('until')
    if until and datetime.now(timezone.utc) > until:
        db.collection('banned').document(username).delete()
        return jsonify({'banned': False})
    return jsonify({
        'banned': True,
        'reason': d.get('reason', 'banished'),
        'until': int(until.timestamp() * 1000) if until else None,
    })

# The follwing is for gif/image uploading.
@app.route('/api/image-upload', methods=['POST'])
def image_upload():
    import uuid
    content_type = request.content_type or 'image/jpeg'
    ext_map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
    }
    ext = ext_map.get(content_type, 'jpg')
    filename = f"image-{uuid.uuid4().hex}.{ext}"
    blob_data = request.data
    if len(blob_data) > 5 * 1024 * 1024:
        return jsonify({'error': 'File too large'}), 413
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(filename)
    blob.upload_from_string(blob_data, content_type=content_type)
    public_url = f'/api/image/{filename}'
    return jsonify({'publicUrl': public_url, 'ext': ext}), 200

@app.route('/api/image/<filename>', methods=['GET'])
def serve_image(filename):
    from flask import send_file
    import io
    ext = filename.rsplit('.', 1)[-1].lower()
    mime_map = {'jpg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'}
    mimetype = mime_map.get(ext, 'image/jpeg')
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(filename)
    data = blob.download_as_bytes()
    return send_file(io.BytesIO(data), mimetype=mimetype)

if __name__ == '__main__':
    app.run(debug=True)