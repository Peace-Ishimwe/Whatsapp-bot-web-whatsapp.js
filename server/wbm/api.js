const sleep = (waitTimeInMs) =>
  new Promise((resolve) => setTimeout(resolve, waitTimeInMs));
const puppeteer = require("puppeteer");
const qrcode = require("qrcode-terminal");
const { from, merge } = require("rxjs");
const { take } = require("rxjs/operators");
const path = require("path");
var rimraf = require("rimraf");

let browser = null;
let page = null;
let counter = { fails: 0, success: 0 };
const tmpPath = path.resolve(__dirname, "../tmp");

/**
 * Initialize browser, page and setup page desktop mode
 */
async function start({
  showBrowser = false,
  qrCodeData = false,
  session = true,
} = {}) {
  if (!session) {
    deleteSession(tmpPath);
  }

  const args = {
    headless: 'new', // Opt in to the new headless mode
    userDataDir: tmpPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  try {
    browser = await puppeteer.launch(args);
    page = await browser.newPage();
    // prevent dialog blocking page and just accept it (necessary when a message is sent too fast)
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    // fix the chrome headless mode true issues
    // https://gitmemory.com/issue/GoogleChrome/puppeteer/1766/482797370
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
    );
    page.setDefaultTimeout(60000);

    await page.goto("https://web.whatsapp.com");
    if (session && (await isAuthenticated())) {
      return;
    } else {
      if (qrCodeData) {
        console.log("Getting QRCode data...");
        console.log(
          "Note: You should use wbm.waitQRCode() inside wbm.start() to avoid errors."
        );
        return await getQRCodeData();
      } else {
        await generateQRCode();
      }
    }
  } catch (err) {
    deleteSession(tmpPath);
    throw err;
  }
}

/**
 * Check if needs to scan QR code or already is inside the chat
 */
function isAuthenticated() {
  console.log("Authenticating...");
  return merge(needsToScan(page), isInsideChat(page)).pipe(take(1)).toPromise();
}

function needsToScan() {
  return from(
    page.waitForSelector("body > div > div > .landing-wrapper", {
      timeout: 0,
    }).then(() => false)
  );
}

function isInsideChat() {
  return from(
    page.waitForFunction(`document.getElementsByClassName('two')[0]`, {
      timeout: 0,
    }).then(() => true)
  );
}

function deleteSession() {
  rimraf.sync(tmpPath);
}

/**
 * Return the data used to create the QR Code
 */
async function getQRCodeData() {
  await page.waitForSelector("div[data-ref]", { timeout: 60000 });
  const qrcodeData = await page.evaluate(() => {
    let qrcodeDiv = document.querySelector("div[data-ref]");
    return qrcodeDiv.getAttribute("data-ref");
  });
  return qrcodeData;
}

/**
 * Access WhatsApp Web page, get QR Code data, and generate it on the terminal
 */
async function generateQRCode() {
  try {
    console.log("Generating QRCode...");
    const qrcodeData = await getQRCodeData();
    qrcode.generate(qrcodeData, { small: true });
    console.log("QRCode generated! Scan it using WhatsApp App.");
  } catch (err) {
    throw await QRCodeException(
      "QR Code can't be generated (maybe your connection is too slow)."
    );
  }
  await waitQRCode();
}

/**
 * Wait 30s for the QR Code to be hidden on the page
 */
async function waitQRCode() {
  // If the user scans the QR Code, it will be hidden
  try {
    await page.waitForSelector("div[data-ref]", {
      timeout: 30000,
      hidden: true,
    });
  } catch (err) {
    throw await QRCodeException("Don't be late to scan the QR Code.");
  }
}

/**
 * Close the browser and show an error message
 * @param {string} msg
 */
async function QRCodeException(msg) {
  await browser.close();
  return "QRCodeException: " + msg;
}

/**
 * Send a message to a phone number
 * @param {string|object} phoneOrContact Phone number or contact object
 * @param {string} message Message to send to the phone number
 */
async function sendTo(phoneOrContact, message) {
  let phone = phoneOrContact;
  if (typeof phoneOrContact === "object") {
    phone = phoneOrContact.phone;
    message = generateCustomMessage(phoneOrContact, message);
  }
  try {
    process.stdout.write("Sending Message...\r");
    await page.goto(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(
        message
      )}`
    );
    await page.waitForSelector("div#startup", { hidden: true, timeout: 60000 });
    await sleep(1000);
    await page.waitForSelector(".selectable-text", { timeout: 30000 });
    await sleep(1000);
    await page.click('span[data-icon="send"]', {
      hidden: true,
      timeout: 30000,
    });
    await sleep(1000);
    console.log(`${phone} Sent\n`);
    counter.success++;
  } catch (err) {
    console.error(err);
    console.log(`${phone} Failed\n`);
    counter.fails++;
  }
}

/**
 * Send the same message to multiple phone numbers
 * @param {array} phoneOrContacts Array of phone numbers or contact objects
 * @param {string} message Message to send to every phone number
 */
async function send(phoneOrContacts, message) {
  for (let phoneOrContact of phoneOrContacts) {
    await sendTo(phoneOrContact, message);
  }
}

/**
 * Replace all text between {{}} with respective contact property
 * @param {object} contact Contact with several properties defined by the user
 * @param {string} messagePrototype Custom message to send to every phone number
 * @returns {string} message
 */
function generateCustomMessage(contact, messagePrototype) {
  let message = messagePrototype;
  for (let property in contact) {
    message = message.replace(
      new RegExp(`{{${property}}}`, "g"),
      contact[property]
    );
  }
  return message;
}

/**
 * Close the browser and show the results (number of messages sent and failed)
 */
async function end() {
  await browser.close();
  console.log(`Result: ${counter.success} sent, ${counter.fails} failed`);
}

module.exports = {
  start,
  send,
  sendTo,
  end,
  waitQRCode,
};