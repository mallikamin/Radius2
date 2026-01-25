# How to Use Media/Attachments Feature

## ✅ Media Functionality is Integrated!

The media/attachment feature is available in **detail modals** for all entities. Here's how to use it:

## 📋 Step-by-Step Guide

### For Existing Receipts:
1. Go to **Receipts** tab
2. **Click on any receipt row** in the table (the entire row is clickable)
3. A detail modal will open showing receipt information
4. Scroll down to the **"Attachments"** section at the bottom
5. Click **"+ Upload"** button
6. Select your file (PDF, Excel, image, video, audio, etc.)
7. Optionally add a description
8. Click **"Upload"**

### For New Receipts:
1. Create a new receipt using "Record Receipt" button
2. After creation, **click on the newly created receipt row** in the table
3. The detail modal will open
4. Scroll to **"Attachments"** section
5. Upload your file

### For Projects (Development Videos):
1. Go to **Projects** tab
2. **Click on any project card** (the entire card is clickable)
3. Project detail modal will open
4. Scroll to **"Attachments"** section
5. Click **"+ Upload"** and select your development video
6. Upload it

### For Transactions:
1. Go to **Transactions** tab
2. Click on any transaction row
3. Transaction detail modal opens
4. Scroll to **"Attachments"** section at the bottom
5. Upload files

### For Payments:
1. Go to **Payments** tab
2. Click on any payment row
3. Payment detail modal opens
4. Scroll to **"Attachments"** section
5. Upload files

### For Interactions:
1. Go to **Interactions** tab
2. Click on any interaction row
3. Interaction detail modal opens
4. Scroll to **"Attachments"** section
5. Upload files (voice notes, screenshots, etc.)

## 🎯 Key Points:
- **All rows/cards are clickable** - just click anywhere on them
- **Attachments section is at the bottom** of each detail modal
- **Supported file types**: PDF, Excel, Images, Videos, Audio files
- **Files are stored** in the `media` directory (persisted via Docker volume)

## 🔍 Troubleshooting:

If you don't see the attachments section:
1. Make sure you clicked on the row/card to open the detail modal
2. Scroll down in the modal - attachments are at the bottom
3. Check browser console for any errors (F12)
4. Verify Docker containers are running: `docker-compose ps`

## 📁 File Storage:
- Local development: Files stored in `./media` directory
- Server deployment: Files stored in configured `MEDIA_ROOT` path
- Files are organized by entity type: `media/transactions/`, `media/receipts/`, etc.

