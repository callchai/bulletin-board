from flask import Flask, render_template, request, jsonify
from google.cloud import firestore
from datetime import datetime, timezone

app = Flask(__name__)
db = firestore.Client(database="bulletin-board")

@app.route('/')
def index():
    return render_template('index.html')

# This is for firestore, to get and add posts
@app.route('/api/posts', methods=['GET'])
def get_posts():
    posts = db.collection('posts').order_by('timestamp').stream()
    result = []
    for p in posts:
        d = p.to_dict()
        d['id'] = p.id
        d.pop('timestamp', None)
        result.append(d)
    return jsonify(result)

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