from flask import Flask, render_template, request, jsonify
from google.cloud import firestore, storage
from datetime import datetime, timezone
import threading

"""
this Main.py file is for the main Flask app that serves the bulletin board and handles API requests.
The Cloud Functions in the CloudFunctions folder handle specific tasks like
moderating images and resetting the board and are triggered by events or scheduled jobs.

Files in js folder handle the frontend logic and interact with the API endpoints defined in this Flask app.
index.html is the main HTML file that structures the frontend of the bulletin board.
the css file in the static folder handle the styling of the frontend.
"""

app = Flask(__name__)
db = firestore.Client()
BUCKET_NAME = 'bulletin-board-drawings'


@app.route('/')
def index():
    """Renders the main page of the bulletin board."""
    return render_template('index.html')

@app.route('/api/posts', methods=['GET'])
def get_posts():
    """
    Fetches posts from Firestore.
    Orders posts by timestamp and adds additional fields like score, denounced status, and zIndex for frontend rendering.

    :return: A JSON response containing a list of posts with their details.
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
    """
    Handles the upload of drawing data as an image file to Cloud Storage. 
    Generates a unique filename, uploads the data, and returns a public URL for the uploaded drawing.

    :param request: The HTTP request object containing the drawing data in the body.
    :return: A JSON response containing the public URL of the uploaded drawing and its file extension.
    """
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
    
    Serves the uploaded drawing image from Cloud Storage when requested by the frontend.
    Downloads the image data from Cloud Storage and sends it as a response with the appropriate MIME type
    for rendering on the frontend.

    :param filename: The name of the drawing file to be served, extracted from the URL.
    :return: A response containing the image data with the correct MIME type for display.
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
    """
    Handles the creation of a new post. Receives post data in JSON format, creates a
    new document in the 'posts' collection in Firestore, and returns the ID of the newly created post.

    :param request: The HTTP request object containing the post data in JSON format.
    :return: A JSON response containing the ID of the newly created post and a 201 status code.
    """
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

@app.route('/api/board-start', methods=['GET'])
def get_board_start():
    """
    Retrieves the board's creation time and generation number from Firestore. 
    If the board document does not exist, it initializes it with the current 
    time and a generation of 0.

    Milliseconds are used for the frontend to handle time calculations and syncing issues.
    (this was a nightmare to debug and fix ngl)

    :return: A JSON response containing the board's creation time in milliseconds and its generation number.
    """
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
    """
    Handles voting on a post. Receives the vote direction and voter information in JSON format,
    updates the votes for the specified post in Firestore, and returns the updated score and user's vote.

    :param post_id: The ID of the post being voted on, extracted from the URL.
    :return: A JSON response containing the updated score of the post and the user's current vote
    """
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

@app.route('/api/trials/active', methods=['GET'])
def get_active_trial():
    """
    Handles fetching the currently active trial. Checks for any trials with a status of 'pending' or 'active',
    and if an active trial has been running for more than 30 seconds, it automatically concludes
    the trial based on the current votes to prevent syncing issues and trial hostage taking.

    :return: A JSON response containing the details of the active trial, or null if there are no active trials.
    """
    trials = db.collection('trials').where('status', 'in', ['pending', 'active']).stream()
    for t in trials:
        d = t.to_dict()
        d['id'] = t.id
        
        if d.get('status') == 'active' and d.get('startedAt'):
            elapsed = (datetime.now(timezone.utc) - d['startedAt']).total_seconds()
            if elapsed > 30:
                # This is to force conclude due to potential syncing issues. 
                from flask import url_for
                import requests
                votes = d.get('votes', {})
                forgive = sum(1 for v in votes.values() if v == 'forgive')
                banish  = sum(1 for v in votes.values() if v == 'banish')
                if forgive > banish:   verdict = 'forgiven'
                elif banish > forgive: verdict = 'banished'
                else:                  verdict = 'exiled'
                ref = db.collection('trials').document(t.id)
                ref.update({'status': 'concluded', 'verdict': verdict, 
                            'concludedAt': firestore.SERVER_TIMESTAMP})
                d['status'] = 'concluded'
                d['verdict'] = verdict
        
        for field in ('startedAt', 'concludedAt'):
            if d.get(field):
                d[field] = int(d[field].timestamp() * 1000)
        return jsonify(d)
    return jsonify(None)

@app.route('/api/trials', methods=['POST'])
def start_trial():
    """
    Handles the initiation of a new trial. Checks for existing active trials, verifies the post and accused user,
    and creates a new trial document in Firestore with the status set to 'pending'.

    NOTE:   Banish count is tracked in meta/flood in Firestore. Once it hits 2, the next trial start 
            will instead trigger a flood instead of creating a new trial. The threshold checks lives
            here rather than in conclude_trial so the flood fires off at the moment a new trial
            would begin, giving concluded trials times to finish.

    :return: A JSON response containing the ID of the newly created trial and a 201 status code 
            OR an error message if the trial cannot be initiated.
    """
    flood_doc = db.collection('meta').document('flood').get()
    flood_data = flood_doc.to_dict() if flood_doc.exists else {}
    if flood_data.get('banishCount', 0) >= 2 and flood_data.get('status') == 'idle':
        db.collection('meta').document('flood').set({
            'status': 'triggered',
            'triggeredAt': firestore.SERVER_TIMESTAMP,
            'banishCount': flood_data.get('banishCount', 2),
        }, merge=True)
        board_ref = db.collection('meta').document('board')
        board_doc = board_ref.get()
        current_gen = board_doc.to_dict().get('generation', 0) if board_doc.exists else 0
        board_ref.update({'generation': current_gen + 1})
        return jsonify({'flood': True}), 200

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
    """
    Handles the submission of a defense statement for an active trial. Validates the trial status and updates
    the trial document in Firestore with the provided defense statement, changing the status to 'active'.

    :param trial_id: The ID of the trial for which the defense is being submitted, extracted from the URL.
    :return: A JSON response indicating success or an error message if the defense cannot be submitted
    """
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
    """
    Handles voting on an active trial. Receives the vote direction and voter information in JSON format,
    updates the votes for the specified trial in Firestore, and returns the updated vote counts and user's vote.

    :param trial_id: The ID of the trial being voted on, extracted from the URL.
    :return: A JSON response containing the updated counts of 'forgive' and 'banish' votes, and the user's current vote.
    """
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
    """
    Handles the conclusion of an active trial. Updates the trial document in Firestore with the final verdict
    and changes the status to 'concluded'.

    :param trial_id: The ID of the trial being concluded, extracted from the URL.
    :return: A JSON response containing the final verdict and vote counts.
    """
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
        _increment_banish_count()

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
    """
    Marks all posts by the specified author as denounced in Firestore. 
    This is used when a user is banished or exiled.

    :param author: The username of the author whose posts are to be denounced.
    """
    posts = db.collection('posts').where('author', '==', author).stream()
    batch = db.batch()
    for p in posts:
        batch.update(p.reference, {'denounced': True})
    batch.commit()

@app.route('/api/banned/<username>', methods=['GET'])
def check_banned(username):
    """
    Checks if a user is currently banned. Retrieves the ban information
    from Firestore and determines if the ban is still active.
    
    :param username: The username to check for a ban, extracted from the URL.
    :return: A JSON response indicating whether the user is banned and the reason for the ban.
            'until' is used for Exile status to help indicate when they can return.
    """
    doc = db.collection('banned').document(username).get()
    if not doc.exists:
        return jsonify({'banned': False})
    d = doc.to_dict()
    until = d.get('until')
    if until:
        until_aware = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
        if datetime.now(timezone.utc) > until_aware:
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
    """
    Handles the upload of an image file to Cloud Storage. Generates a unique filename based on the content type,
    uploads the image data, and returns a public URL for the uploaded image.

    :param request: The HTTP request object containing the image data in the body and the content type header.
    :return: A JSON response containing the public URL of the uploaded image and its file extension, 
            or an error message if the file is too large.
    """
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
    """
    Handles the serving of an uploaded image from Cloud Storage. Downloads the image data and sends it as a response
    with the appropriate MIME type for rendering on the frontend.

    :param filename: The name of the image file to be served, extracted from the URL.
    :return: A response containing the image data with the correct MIME type for display.
    """
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

# The following deals with flood status and reset.
@app.route('/api/flood/status', methods=['GET'])
def flood_status():
    """
    This endpoint provides the current flood status of the board. It retrieves the flood information from Firestore,
    including the current status, banishment count, and the time when the flood was triggered.
    This information is used by the frontend to determine if the board is currently in a flood state
    and to display relevant information to users.

    :return: A JSON response containing the flood status, banishment count, 
            time of flood trigger, reason for flood, and offending post if applicable.
    """
    doc = db.collection('meta').document('flood').get()
    if not doc.exists:
        return jsonify({'status': 'idle', 'banishCount': 0, 'triggeredAt': None, 'offendingPost': None})
    d = doc.to_dict()
    triggered_at = d.get('triggeredAt')
    return jsonify({
        'status':        d.get('status', 'idle'),
        'banishCount':   d.get('banishCount', 0),
        'triggeredAt':   int(triggered_at.timestamp() * 1000) if triggered_at else None,
        'reason':        d.get('reason', None),
        'offendingPost': d.get('offendingPost', None),
    })


def _increment_banish_count():
    """
    Increments the banishment counter in meta/flood in firestore.

    :return: The new banishment count after incrementing.
    """
    ref = db.collection('meta').document('flood')
    doc = ref.get()
    if doc.exists:
        current = doc.to_dict().get('banishCount', 0)
    else:
        current = 0
    new_count = current + 1
    ref.set({'banishCount': new_count, 'status': doc.to_dict().get('status', 'idle') if doc.exists else 'idle'}, merge=True)
    return new_count

@app.route('/api/flood/reset', methods=['POST'])
def flood_reset():
    """
    Reset board after flood: clear posts, trials, bans, reset clock and flood state.
    :return: A JSON response indicating that the reset was successful.
    """
    def delete_collection(col_ref):
        """
        Deletes a collection in Firestore in a batch.
        """
        while True:
            docs = list(col_ref.limit(400).stream())
            if not docs:
                break
            batch = db.batch()
            for doc in docs:
                batch.delete(doc.reference)
            batch.commit()

    delete_collection(db.collection('posts'))
    delete_collection(db.collection('trials'))
    delete_collection(db.collection('banned'))

    db.collection('meta').document('flood').set({
        'status': 'idle',
        'banishCount': 0,
        'triggeredAt': None,
    })

    now = datetime.now(timezone.utc)
    board_ref = db.collection('meta').document('board')
    board_doc = board_ref.get()
    current_gen = board_doc.to_dict().get('generation', 0) if board_doc.exists else 0
    board_ref.set({'createdAt': now, 'generation': current_gen + 1})

    return jsonify({'ok': True}), 200

@app.route('/api/now', methods=['GET'])
def server_now():
    """
    This function provides the current server time in milliseconds.
    It mainly serves to solve synchronization issues Users's machines
    and the App Engine server.
    """
    now = datetime.now(timezone.utc)
    return jsonify({'nowMs': int(now.timestamp() * 1000)})

if __name__ == '__main__':
    app.run(debug=True)