from flask import Flask, render_template, request, jsonify
from google.cloud import firestore, storage
from datetime import datetime, timezone

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
        'timestamp': firestore.SERVER_TIMESTAMP
    }
    doc_ref.set(post)
    return jsonify({'id': doc_ref.id}), 201

# This is for the clock
@app.route('/api/board-start', methods=['GET'])
def get_board_start():
    doc = db.collection('meta').document('board').get()
    if doc.exists:
        ts = doc.to_dict().get('createdAt')
        if ts is None:
            now = datetime.now(timezone.utc)
            db.collection('meta').document('board').set({'createdAt': now})
            return jsonify({'startMs': int(now.timestamp() * 1000)})
        return jsonify({'startMs': int(ts.timestamp() * 1000)})
    else:
        now = datetime.now(timezone.utc)
        db.collection('meta').document('board').set({'createdAt': now})
        return jsonify({'startMs': int(now.timestamp() * 1000)})
    
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

if __name__ == '__main__':
    app.run(debug=True)