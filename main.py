from flask import Flask, render_template, request, jsonify
from google.cloud import firestore
from datetime import datetime, timezone

app = Flask(__name__)
db = firestore.Client()

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
        d['zIndex'] = z
        z += 1
        d.pop('timestamp', None)
        result.append(d)
    response = jsonify(result)
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/posts', methods=['POST'])
def add_post():
    data = request.get_json()
    doc_ref = db.collection('posts').document()
    post = {
        'text':      data['text'],
        'author':    data['author'],
        'color':     data['color'],
        'x':         data['x'],
        'y':         data['y'],
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

if __name__ == '__main__':
    app.run(debug=True)