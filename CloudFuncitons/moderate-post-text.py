import functions_framework
import json
from google.cloud import firestore, language_v2
from datetime import datetime, timezone

"""
This cloud function is used to moderate TEXT posts. It uses 
Google Cloud Natural Language API to scan text (including captions)
for toxicity, profanity, insults, derogatory language, and sexually explicit content. 
If any of these categories are flagged above a certain rating, a flood occurs.


Had to read official documentation for this:
https://docs.cloud.google.com/natural-language/docs
https://docs.cloud.google.com/natural-language/docs/basics
https://docs.cloud.google.com/natural-language/docs/moderating-text
https://docs.cloud.google.com/natural-language/docs/reference/rpc/google.cloud.language.v2

Also used this article for a little help
https://medium.com/google-cloud/moderating-text-with-the-natural-language-api-5d379727da2c
"""

MODERATION_THRESHOLD = 0.8
FLAGGED_CATEGORIES = {"Toxic", "Profanity", "Sexually Explicit", "Insult", "Derogatory"}

db = firestore.Client()
language_client = language_v2.LanguageServiceClient()

@functions_framework.cloud_event
def moderate_post_text(cloud_event):
    # The subject is plain text like:
    # "documents/posts/POST_ID"
    subject = cloud_event["subject"]
    post_id = subject.split("/")[-1]

    if not post_id:
        print("Could not extract post_id from subject:", subject)
        return

    print(f"Triggered for post: {post_id}")

    post_ref = db.collection("posts").document(post_id)
    post_doc = post_ref.get()
    if not post_doc.exists:
        print(f"Post {post_id} not found")
        return

    post = post_doc.to_dict()

    parts = []
    if post.get("text"):
        parts.append(post["text"])
    if post.get("caption"):
        parts.append(post["caption"])
    if not parts:
        print(f"Post {post_id} has no text to scan.")
        return

    text_to_scan = " ".join(parts)
    print(f"Scanning: '{text_to_scan[:80]}'")

    document = language_v2.Document(
        content=text_to_scan,
        type_=language_v2.Document.Type.PLAIN_TEXT,
    )

    try:
        response = language_client.moderate_text(document=document)
    except Exception as e:
        print(f"Moderation API error: {e}")
        return

    triggered_category = None
    for category in response.moderation_categories:
        print(f"  {category.name}: {category.confidence:.2f}")
        if category.name in FLAGGED_CATEGORIES and category.confidence >= MODERATION_THRESHOLD:
            triggered_category = category.name
            break

    if not triggered_category:
        print(f"Post {post_id} is clean.")
        return

    print(f"Post {post_id} FLAGGED: {triggered_category}")

    flood_ref = db.collection("meta").document("flood")
    flood_doc = flood_ref.get()
    flood_data = flood_doc.to_dict() if flood_doc.exists else {}
    if flood_data.get("status") == "triggered":
        print("Flood already in progress, skipping.")
        return

    offending_post = {
        "postId":   post_id,
        "author":   post.get("author", "Unknown"),
        "text":     post.get("text", ""),
        "caption":  post.get("caption", ""),
        "type":     post.get("type", "text"),
        "imageUrl": post.get("imageUrl", None),
        "color":    post.get("color", {"bg": "#fff9a3", "author": "#b8a800"}),
        "category": triggered_category,
    }

    flood_ref.set({
        "status":        "triggered",
        "triggeredAt":   firestore.SERVER_TIMESTAMP,
        "banishCount":   flood_data.get("banishCount", 0),
        "reason":        "moderation",
        "offendingPost": offending_post,
    }, merge=True)

    board_ref = db.collection("meta").document("board")
    board_doc = board_ref.get()
    current_gen = board_doc.to_dict().get("generation", 0) if board_doc.exists else 0
    board_ref.update({"generation": current_gen + 1})

    print(f"Flood triggered by post {post_id} — {triggered_category}")
    