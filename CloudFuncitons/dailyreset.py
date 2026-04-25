import functions_framework
from google.cloud import firestore
from datetime import datetime, timezone

# https://docs.cloud.google.com/scheduler/docs/overview
# Had to read official documentation on how to do this.

"""
This is the Cloud function that uses Cloud Scheduler to reset the board
every night at midnight (EDT). Might change time later.

The job in Cloud Scheduler curls(?) the URL to trigger reset_board.

https://docs.cloud.google.com/scheduler/docs/overview
Had to read official documentation on how to do this.
"""

db = firestore.Client()

def _delete_collection(col_ref, batch_size=100):
    """
    Deletes all documents in a Firestore collection in batches to avoid timeouts.

    :param col_ref: Reference to the Firestore collection to delete.
    :param batch_size: Number of documents to delete in each batch.
    """
    docs = list(col_ref.limit(batch_size).stream())
    while docs:
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        docs = list(col_ref.limit(batch_size).stream())

@functions_framework.http
def reset_board(request):
    """
    HTTP Cloud Function to reset the board. Deletes all posts, trials, and banned users,
    and resets the board's creation time to the current time. Keeps score of generations.

    :param request: The HTTP request object (not used in this function).
    :return: A tuple containing a message and an HTTP status code.
    """
    _delete_collection(db.collection('posts'))
    _delete_collection(db.collection('trials'))
    _delete_collection(db.collection('banned'))
    board_ref = db.collection('meta').document('board')
    doc = board_ref.get()
    current_gen = doc.to_dict().get('generation', 0) if doc.exists else 0

    board_ref.set({
        'createdAt': datetime.now(timezone.utc),
        'generation': current_gen + 1,
    })

    return ('The Board has been reset', 200)
