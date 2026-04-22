import functions_framework
from google.cloud import firestore, language_v2
from datetime import datetime, timezone

"""
This cloud function is used to moderate TEXT posts. It uses 
Google Cloud Natural Language API to scan text (including captions)
for toxicity, profanity, and sexually explicit content. If any of these
categories are flagged above a certain rating, a flood occurs.


Had to read official documentation for this:
https://docs.cloud.google.com/natural-language/docs

Also used this article for a little help
https://medium.com/google-cloud/moderating-text-with-the-natural-language-api-5d379727da2c
"""

MODERATION_THRESHOLD = 0.8
FLAGGED_CATEGORIES = {"Toxic", "Profanity", "Sexually Explicit"}

db = firestore.Client()
language_client = language_v2.LanguageServiceClient()

@functions_framework.cloud_event
def moderate_post_text(cloud_event):
    """
    Triggered by a Firestore write to posts/{postId}.
    Scans text content and triggers flood if flagged.
    """
    data = cloud_event.data
    post_id = data["value"]["name"].split("/")[-1]

    # Read the post from Firestore
    post_ref = db.collection("posts").document(post_id)
    post_doc = post_ref.get()
    if not post_doc.exists:
        return

    post = post_doc.to_dict()

    # This will scan text and caption fields if they exist.
    parts = []
    if post.get("text"):
        parts.append(post["text"])
    if post.get("caption"):
        parts.append(post["caption"])
    if not parts:
        return

    text_to_scan = " ".join(parts)

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
        if category.name in FLAGGED_CATEGORIES and category.confidence >= MODERATION_THRESHOLD:
            triggered_category = category.name
            print(f"Post {post_id} flagged: {category.name} ({category.confidence:.2f})")
            break

    # When post is pure and clean
    if not triggered_category:
        return

    # Check flood isn't already triggered
    flood_ref = db.collection("meta").document("flood")
    flood_doc = flood_ref.get()
    flood_data = flood_doc.to_dict() if flood_doc.exists else {}
    if flood_data.get("status") == "triggered":
        return

    # Build offending post snapshot for the warning overlay
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

    # Flood trigger
    flood_ref.set({
        "status":        "triggered",
        "triggeredAt":   firestore.SERVER_TIMESTAMP,
        "banishCount":   flood_data.get("banishCount", 0),
        "reason":        "moderation",
        "offendingPost": offending_post,
    }, merge=True)

    # Force refresh
    board_ref = db.collection("meta").document("board")
    board_doc = board_ref.get()
    current_gen = board_doc.to_dict().get("generation", 0) if board_doc.exists else 0
    board_ref.update({"generation": current_gen + 1})

    print(f"Flood triggered by post {post_id} — category: {triggered_category}")