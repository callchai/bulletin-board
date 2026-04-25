import functions_framework
from google.cloud import firestore, vision, storage
from datetime import datetime, timezone

"""
This cloud function is used to moderate ATTACHMENT posts.
It uses Google Cloud Vision API to scan images for inappropriate content.
If the image is flagged above a certain rating, a flood occurs.

It uses Cloud Vision's Safe Search Detection, which 
gives likelihood ratings for various categories of content.

Categories have the same severity level, so they require the same score each
to trigger a flood.

Categories:
- Violence: anything that is graphic. Can potentially be triggered by cartoony violence,
            or sports. This one may be a bit sensitive.
- Racy:     anything suggestive or provocative, but not explicit nudity or sexual activity.
- Adult:    any explicit nudity or pornographic content.
        
NOTE:   Vision API can only analyze the first FRAME of GIFS,
        so we pray no one posts something that's fine in the first frame
        but inappropriate in later frames.
        Additionally, I believe I have not made it detect text in images.

Had to read official documentation for this:
https://docs.cloud.google.com/vision/docs/features-list

And some qwiklabs:
https://www.skills.google/course_templates/633?catalog_rank=%7B%22rank%22%3A1%2C%22num_filters%22%3A0%2C%22has_search%22%3Atrue%7D&search_id=81775623

"""

# Likelihood levels in order of severity (from Vision API enum)
LIKELIHOOD_LEVELS = {
    "UNKNOWN": 0,
    "VERY_UNLIKELY": 1,
    "UNLIKELY": 2,
    "POSSIBLE": 3,
    "LIKELY": 4,
    "VERY_LIKELY": 5,
}

# Trigger flood if any of these attributes hits this threshold or above
MODERATION_THRESHOLD = "LIKELY"
FLAGGED_ATTRIBUTES = {"adult", "violence", "racy"}

db = firestore.Client()
vision_client = vision.ImageAnnotatorClient()

@functions_framework.cloud_event
def moderate_post_image(cloud_event):
    """
    This function is triggered by a Cloud Storage eventarc when a new image is uploaded.
    It checks the image using Cloud Vision API's Safe Search Detection.
    If the image is flagged for inappropriate content, it triggers a flood on the board.

    :param cloud_event: The CloudEvent object containing event data.
    """
    data = cloud_event.data
    bucket_name = data.get("bucket")
    filename = data.get("name")

    if not filename or not bucket_name:
        print("Missing bucket or filename in event data.")
        return

    # Only process image prefixed files, not drawing files
    if not filename.startswith("image-"):
        print(f"Skipping non-image file: {filename}")
        return

    print(f"Scanning image: gs://{bucket_name}/{filename}")

    image = vision.Image(
        source=vision.ImageSource(gcs_image_uri=f"gs://{bucket_name}/{filename}")
    )

    try:
        response = vision_client.safe_search_detection(image=image)
    except Exception as e:
        print(f"Vision API error: {e}")
        return

    safe = response.safe_search_annotation
    threshold_level = LIKELIHOOD_LEVELS[MODERATION_THRESHOLD]

    triggered_category = None
    # These are Vision API's own categories and likelihood ratings, 
    # which will be use to determine if the image is inappropriate
    results = {
        "adult":    vision.Likelihood(safe.adult).name,
        "violence": vision.Likelihood(safe.violence).name,
        "racy":     vision.Likelihood(safe.racy).name,
        "spoof":    vision.Likelihood(safe.spoof).name,
        "medical":  vision.Likelihood(safe.medical).name,
    }

    print(f"Safe search results for {filename}: {results}")

    for attr in FLAGGED_ATTRIBUTES:
        level_name = results.get(attr, "UNKNOWN")
        if LIKELIHOOD_LEVELS.get(level_name, 0) >= threshold_level:
            triggered_category = attr
            break

    if not triggered_category:
        print(f"{filename} is clean.")
        return

    print(f"{filename} FLAGGED: {triggered_category} = {results[triggered_category]}")

    # Find the post in Firestore that references this image URL
    image_url = f"/api/image/{filename}"
    posts = db.collection("posts").where("imageUrl", "==", image_url).limit(1).stream()
    post_doc = next(posts, None)

    flood_ref = db.collection("meta").document("flood")
    flood_doc = flood_ref.get()
    flood_data = flood_doc.to_dict() if flood_doc.exists else {}

    if flood_data.get("status") == "triggered":
        print("Flood already in progress, skipping.")
        return

    offending_post = {
        "postId":    post_doc.id if post_doc else None,
        "author":    post_doc.to_dict().get("author", "Unknown") if post_doc else "Unknown",
        "text":      "",
        "caption":   post_doc.to_dict().get("caption", "") if post_doc else "",
        "type":      "image",
        "imageUrl":  image_url,
        "color":     post_doc.to_dict().get("color", {"bg": "#fff9a3", "author": "#b8a800"}) if post_doc else {"bg": "#fff9a3", "author": "#b8a800"},
        "category":  f"{triggered_category} ({results[triggered_category]})",
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

    print(f"Flood triggered by image {filename} — {triggered_category}: {results[triggered_category]}")
