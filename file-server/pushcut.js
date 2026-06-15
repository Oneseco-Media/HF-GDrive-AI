const fetch = require('node-fetch');

const PUSHCUT_API_KEY = process.env.PUSHCUT_API_KEY;
// The default notification name to trigger
const PUSHCUT_NOTIFICATION_NAME = process.env.PUSHCUT_NOTIFICATION_NAME || 'FileUpload';

const ENABLE_PUSHCUT = !!(PUSHCUT_API_KEY);

/**
 * Sends a notification using Pushcut API
 * @param {string} title - Notification title
 * @param {string} text - Notification text
 * @param {string} notificationName - Name of the notification defined in Pushcut (optional)
 * @returns {Promise<Object>} - Response from Pushcut
 */
async function sendNotification(title, text, notificationName = PUSHCUT_NOTIFICATION_NAME) {
  if (!ENABLE_PUSHCUT) {
    throw new Error('Pushcut is not configured');
  }

  try {
    const response = await fetch(`https://api.pushcut.io/v1/notifications/${notificationName}`, {
      method: 'POST',
      headers: {
        'API-Key': PUSHCUT_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title,
        text: text
      })
    });

    if (!response.ok) {
      throw new Error(`Pushcut API error: ${response.status} ${response.statusText}`);
    }

    // According to Pushcut docs, responses can be 200 or 202 without a strict JSON body always guaranteed,
    // but typically it returns JSON.
    const textResp = await response.text();
    if (textResp) {
      try {
         return JSON.parse(textResp);
      } catch (e) {
         return { message: textResp };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending Pushcut notification:', error);
    throw error;
  }
}

module.exports = {
  sendNotification,
  ENABLE_PUSHCUT
};
