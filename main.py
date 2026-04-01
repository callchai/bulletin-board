from flask import Flask, render_template, request, jsonify
from google.cloud import firestore

app = Flask(__name__)
db = firestore.Client()

@app.route('/')
def index():
    return render_template('index.html')

#  routes for firestore
@app.route('/api/posts', methods=['GET'])
def get_posts():
    posts = db.collection('posts').order_by('timestamp').stream()
    return jsonify([p.to_dict() | {'id': p.id} for p in posts])

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

@app.route('/api/board-start', methods=['GET'])
def get_board_start():
    doc = db.collection('meta').document('board').get()
    if doc.exists:
        ts = doc.to_dict().get('createdAt')
        return jsonify({'startMs': int(ts.timestamp() * 1000)})
    else:
        now = firestore.SERVER_TIMESTAMP
        db.collection('meta').document('board').set({'createdAt': now})
        import time
        return jsonify({'startMs': int(time.time() * 1000)})


if __name__ == '__main__':
    app.run(debug=True)