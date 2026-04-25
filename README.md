# The BOARD

Visit the BOARD today: https://tinyurl.com/cis437BOARD

This project for CIS 437 is a web application that is supposed to mimic a community bulletin board, think of it as a social media website. It has a biblical theme to be dramatic. Users can posts sticky notes that either contain solely text, or an attachment (drawing, image, gif, etc.) with a optional caption.

## Overview
### Posting
At the top toolbar, there is a button "Post".

Clicking the button opens the Post modals. You can choose between:
* Text: post a sticky note with **text** only. You can change the background from a preset palette of colors.
* Draw: draw a post. You can customize the color of your brush and the background color. You may add a caption to your drawing that will be seen when someone views the post in full.
* Attachment (image/GIF): post a image (of supported file types) or a GIF. GIFs are animated on the Board. Attachments may also be given a caption.
> [!WARNING]
> Changing the color of the background during Draw mode will reset the drawing. Additionally, if a text post or attachment post is too long, it may appear shortened with a fading affect, but can be viewed in full by clicking on it.
### Names
Each user is given a random name upon first visit. Each alias is a NATO alphabetical codename and three random letters (e.g Zulu-123). There is a search bar in the top right near the clock that can be used to search for posts from specific authors.

### Trials
When a post receives a large enough negative score, they will be deemed as a *accused transgressor*. They will have a popup on their webpage, telling them they have been summon before the Board's court, and can provide a defense for themselves.

The Accused individual can choose to not provide a defense. After thirty seconds, or when the Accused submits their defense, a new popup appears for everyone else. Every other user can join in on the Trial and **vote** on the verdict.

There are three verdicts:
* **Banishment**: `Accused is completely banished from the Board and cannot return. All posts are denounced.`
* **Forgiveness**: `Accused is forgiven. Nothing happens to them.`
* **Exile**: `If there is a tie, the Accused is banished temporarily, and can return after a brief period. All their posts at the time of Exile are denounced`.

### Denouncement
People who are banished will cause their posts to become "denounced", being erased from the board and left censored as black squares.

### Daily Reset
The Board's contents are reset every day at midnight (EST). Every post is erased, and everyone is given a different identity. If a user is on the webpage during a reset, their webpage is forced to refresh.

### Floods (forced resets)
There are two conditions that will cause an event called a **Flood**. A Flood is a premature reset of the Board that happens due to the actions of posters.

> [!NOTE]
> When a flood is triggered, a warning popup appears for 20 seconds, then, an animation plays that lasts 60 seconds, filling the Board. When the animation is complete, the Board resets with a "submerged" screen.

These are the following conditions:
  * Moderation scan: if a user posts something that is deemed to inappropriate, the Board will reset itself instantly.
  * Wickedness: if two users have already been banished by the people, and a third trial is underway, the Board will instead start a flood instead of a third trial, as the current Board has shown itself to be too wicked for continuous existence.

# Cloud Services used
* App Engine
* Cloud Storage 
* Firestore
* Cloud Functions
* Cloud Scheduler
* Eventarc
* API Services:
  * Vision API
  * Natural Language API

# How the Services Interact With Each Other
This section will provide a summary of how each service used interacts with each other.
## Regular User flow
> When a user first visits a website
1. App Engine spins up (on first visit), and serves `index.html`
2. The Browser will fetch posts, board data, and any potential ban/trial statuses from the Flask API (from the App Engine), which reads from Firestore
3. The user posts something:
    * The browser posts to `/api/posts`
    * Flask will write the document to the Firestore `post` collection as a `.json` file
4. If a post **contains text or a caption**, `Eventarc` detects the Firestore write and triggers the `moderate-post-text` Cloud Function, which calls the **Natural Language API** to scan for any potential inappropriate content.
5. If a post is **an attachment** (images, GIFs), the browser will upload directly to Flask (`/api/drawing-upload` or `/api/image-upload`), and then Flask will store it in Cloud Storage.
    * The new object in Cloud Storage triggers the `moderate-post-image` Cloud Function via Eventarc, which calls the **Vision API** [safe search detection] to scan the image.

## Moderation & Floods
> Interactions when a Flood event is triggered via **API moderation**
1. If either moderation Cloud Function (`moderate-post-text` or `moderate-post-image`) detects a violation above a certain threshold, it writes `status: "triggered"` in `meta/flood` in Firestore.
2. The frontend of the web application polls `/api/flood/status` every few seconds. When it sees `status: "triggered"`, it displays the flood warning modal (that names the offender and shows the offending post), then a flood animation plays over the course of 60 seconds.
3. After the animation completes, the browser calls `/api/flood/reset`. This causes Flask to delete all documents in `posts`, `trials`, and `banned`, and resets the flood state. All connected users detect the change on their next `/api/board-start` poll and the webpage refreshes automatically.

## Trials and Banishment
> When a post's score reaches -4, the author is put on trial.
1. When a post reaches a score of -4, the frontend POSTs to `/api/posts`, and Flask creates a trial document in Firestore
2. All users poll `/api/trials/active` every few seconds to display the trial UI and modals. The accused submits a defense via `/api/trials/{id}/defense`. Other users vote from `/api/trials/{id}/vote`.
3. After 30 seconds, a client calls `/api/trials/{id}/conclude`. Flask will then tally the votes, writes a verdict, and (if banished or exiled) writes to the `banned` collection and marks the accused's posts as `denounced: true` in Firestore. All other users will see the denounced state on their next posts poll refresh.
### Flood via Trials
If **two** users have already been banished, and a **third trial** is triggered, Flask will skip creating a third trial and instead triggers a Flood, following steps 1-3 from the `Moderation & Floods` section. However, a different warning modal popup appears.

## Daily Reset
**Cloud Scheduler** executes a job everyday at 12:00 midnight (EST), which hits the URL for the `reset-board` Cloud Function. This function deletes all `posts`, `trials`, and `banned` documents from Firestore, rests the board `createdAt` timestamp (resetting the clock), and causes all active user's webpages to refresh.

# Setup & Deployment
This section will go over how to setup and deploy a web application like the BOARD.
## 1. Enabling APIS
> Enable the following APIs in the Google Cloud Console
  * App Engine
  * Cloud Firestore
  * Cloud Storage
  * Cloud Functions
  * Cloud Scheduler
  * Eventarc
  * Cloud Vision API
  * Cloud Natural Languages API
  * Cloud Run Admin (for app engine deployment)

## Create Firestore Database
> [!NOTE]
> Firestore may create a database (called 'default') by itself, we will use this one.
Make sure the database has the following options selected:
  * `Edition` = **STANDARD**
  * `Mode` = **NATIVE MODE**
  * `Location` = **us-east4** [region/zone used for all services if applicable]

The Flask app will automatically create the following collections on first use:
  * `posts`
  * `trials`
  * `banned`
  * `meta` -- metadata (`board` and `flood` data)

## Creating a Cloud Storage Bucket
1. Go to the Google Cloud Console and create a new Bucket within Cloud Storage
2. Name the bucket `bulletin-board-drawings`
3. Apply these settings:
    * Set the `Location` to `region`. Set region to `us-east4`
    * Under `Choose how to store your data`, make sure `default class` is set to `standard`
    * Under `Choose how to control access to objects`, make sure `Enforce public access prevention on this bucket` is **unchecked**, and `uniform` access control is selected.
4. Create the bucket.

## Deploying App Engine
1. While in the project folder, enter Cloud Shell.
2. Make sure the following files and folders are in the same directory:
    * `app.yaml`
    * `main.py`
    * `requirements.txt` -- make sure this the `main.py` that is **not** in the `Cloud Functions` folder.
    * `static` -- this should contain a folder called `css` with CSS styling, and a folder called `js`, which is all JavaScript files.
    * `templates` -- this include the index.html file
### Deploying App Engine in Cloud Shell
In Cloud Shell, type:<br>
`gcloud app deploy app.yaml`
> You may have to select a region, select us-east4<br>
> Additionally, you may not have to type `app.yaml` at the end.

After a few minutes, the Web app should deploy, and a clickable link can be found with
`gcloud app browse`.

## Deploying Cloud Functions
To deploy the three Cloud Functions used, go to Cloud Functions on the Google Cloud Console.
> [!IMPORTANT]
> **All** functions will use Python 3.11 as runtime!!
> For some reason 3.12+ and Google Cloud doesn't like to work together.

### Create `moderate-post-text`
At the Cloud Function screen, create a new **Python** function
1. Name the function `moderate-post-text`
2. Set the region to `us-east4`
3. **Set runtime** to `Python 3.11`
#### Setup Eventarc for moderate-post-text
4. Under `Trigger`, add an new one:
    * Select `Other Eventarc trigger`
    * Make sure `trigger type` is set to `Google sources` and that `Event provider` is set to `Cloud Firestore`
    * In `Event type`, set it to `google.cloud.firestore.document.v1.created`
    * Set `region` to `us-east4`
    * Set service account to `Default compute service account`
    * Set `Service URL path` to `/posts/{postId}`
5. Make sure that under `Authentication`, **Require Authentication** is selected, and so is **IAM**
#### Source code and deploy
6. Put the source code of `moderate-post-text` into the newly created function
    * **You must** set the `function entry point` to `moderate_post_text`
    * ***In the requirements.txt** file for this function, it **must** have:<br>
        `functions-framework==3.8.1`<br>
        `google-cloud-firestore==2.16.0`<br>
        `google-cloud-language==2.13.0`<br>
7. Save and Deploy the function.
> [!NOTE]
> The default service account should be something like `"...-compute@developer.gserviceaccount.com"`, where `...` is a bunch of numbers.

### Create 'moderate-post-image`
Create another **Python** function
1. Name the function `moderate-post-image`
2. Set the region to `us-east4`
3. Set the runtime to `Python 3.11`
#### Setup Eventarc for moderate-post-image
4. Under `Trigger`, add an new one:
    * Select `Other Eventarc trigger`
    * Make sure `trigger type` is set to `Google sources` and that `Event provider` is set to `Cloud Storage`
    * In the `Bucket` field, make sure the `bulletin-board-drawings` bucket is selected.
    * Make sure `service account` field is set to `Default compute service account`
5. Make sure that under `Authentication`, **Require Authentication** is selected, and so is **IAM**
#### Source Code and Deploy
6. Put the source code of `moderate-post-image` into the newly created function
    * **You must** set the `function entry point` to `moderate_post_image`
    * ***In the requirements.txt** file for this function, it **must** have:<br>
      `functions-framework==3.*`<br>
      `google-cloud-firestore==2.16.0`<br>
      `google-cloud-vision==3.7.0`<br>`
      `google-cloud-storage==2.16.0`<br>
7. Save and Deploy the function.

### Create reset.py
Create another **Python** function.
1. Name the function `reset-board`
2. Set the region to `us-east4`
3. The Python runtime for this can be anyone, but best to choose `Python 3.11`
4. Make sure that under `Authentication`, **Require Authentication** is selected, and so is **IAM**
#### Source Code and Deploy
5. Put the source code of `reset-board` into the newly created function.
    * **You must** set the `function entry point` to `reset_board`
    * **In the requirements.txt** file for this function, it **must** have:<br>
      `functions-framework==3.8.2`<br>
      `google-cloud-firestore>=2.19.0`<br>
7. Save and Deploy the function.

## Creating a reset job in Cloud Scheduler
This will create the daily midnight reset for the board. It will use the `reset_board` Cloud Function made in the last step.
1. Go to Cloud Scheduler and create a new job
2. Set the region to `us-east4`
3. In the **Frequency** field:
    * Set it to `0 0 * * *` -- this is set to midnight, everyday.
    * Set the `timezone` to Eastern Daylight Time
4. In **Configure the execution** section:
    * Set `target type` to `HTTP`
    * In the URL field, set it to the service URL of the `reset_board` function, so this job can call it.
    * Set `HTTP Method` to `POST`
    * Under `HTTP Headers`, add a header with the name `User-Agent` and a value of `Google-Cloud-Scheduler`
    * In `Auth Header`, select `Add OIDC Token`
    * In `Service Account`, select `App Engine default service account`
    * In the `Audience` field, copy and paste the URL of `reset_board` again.
5. Create the Scheduler

## Enabling Permissions
### Enable permissions for the App Engine Default Service Account
  * Go to `IAM & Admin` > `IAM`
  * You should see a App Engine Default Service Account
  > It will have a name like [project-ID]@appspot.gserviceaccount.com
  * Grant this service account the following roles and permissions:<br>
  `Cloud Datastore User`<br>
  `Cloud Run Invoker`<br>
  `Editor`<br>
  `Storage Object Viewer`<br>
### Enable permissions for the Default Compute Service Account
  * In the `IAM` page, look for the Default Compute Service Account
  > It should look like `[...]@developer.gserviceaccount.com`, where `...` is a bunch of numbers
  * Grant this service account the following roles and permissions:<br>
  `Cloud Datastore User`<br>
  `Cloud Run Invoker`<br>
  `Editor`<br>
  `Eventarc Event Reciever`<br>

#### The webpage should be fully functional now.
> [!NOTE]
> You may have to redeploy the App Engine once more.