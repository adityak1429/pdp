const sessionId = new URLSearchParams(window.location.search).get('session');
if (!sessionId) {
  alert("Session ID is required in the URL (e.g. ?session=12345)");
  document.querySelector('.container').innerHTML = '';
  throw new Error("Session ID not provided");
}

let metadata = {};
let baseListing = {};
let featuresArr = [];
let hardwareArr = [];
let iconFile = null;
let iconDataUrl = null;
let currentListingKey = null;

// --- MediaType Enum ---
const MediaType = {
  SCREENSHOT: "Screenshot",
  ICON: "Icon",
  TRAILER: "Trailer",
  TRAILER_IMAGE: "TrailerImage",
  OTHER: "other"
};

function saveNonListingMetadata() {
  metadata.applicationCategory = document.getElementById('category').value;
  metadata.visibility = document.getElementById('visibility').value;
  metadata.targetPublishMode = document.getElementById('publishMode').value;
  metadata.targetPublishDate = document.getElementById('publishDate').value;
  if (!metadata.pricing) metadata.pricing = {};
  metadata.pricing.priceId = document.getElementById('pricing').value;
  metadata.pricing.trialPeriod = document.getElementById('trial').value;
  metadata.automaticBackupEnabled = document.getElementById('backup').value === 'true';
  metadata.hasExternalInAppProducts = document.getElementById('inapp').value === 'true';
  metadata.meetAccessibilityGuidelines = document.getElementById('accessibility').value === 'true';
  if (!metadata.gamingOptions || !Array.isArray(metadata.gamingOptions)) metadata.gamingOptions = [{}];
  if (!metadata.gamingOptions[0]) metadata.gamingOptions[0] = {};
  metadata.gamingOptions[0].genres = [];
}

// --- Use enum for getMediaType ---
function getMediaType(originalname) {
  for (const type of Object.values(MediaType)) {
    if (originalname.split('_')[0]===(type)) return type;
  }
  throw new Error(`Unknown media type for file: ${originalname}`);
}

// --- Global media object ---
const globalMedia = {}; // { filename: { file, dataUrl, type, locale } }

// --- Helper: Add file to globalMedia with prefix ---
function addMediaFile(file, type, locale) {
  const ext = file.name.split('.').pop();
  const filename = `${type}_${locale}_${Date.now()}.${ext}`;
  const reader = new FileReader();
  reader.onload = function(e) {
    addToGlobalMedia(filename, e.target.result, locale);
  };
  reader.readAsDataURL(file);
}
// list of all locales in ms store
const ALL_LOCALES = [ 'en', 'fr', 'de', 'es', 'it', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW', 'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'da', 'fi', 'no' ];

function addToGlobalMedia(filename, dataUrl, locale) {
    if(locale==="all"){
        globalMedia[filename] = {
            filename,
            dataUrl,
            type:getMediaType(filename),
            locales : [...ALL_LOCALES],
            };
        }
    else{
        globalMedia[filename] = {
            filename,
            dataUrl,
            type:getMediaType(filename),
            locales : [locale],
            };
    }
}

function removeFromGlobalMedia(filename) {
    if (globalMedia[filename]) {
        // Remove currentListingKey from the locales array
        const idx = globalMedia[filename].locales.indexOf(currentListingKey);
        if (idx !== -1) {
            globalMedia[filename].locales.splice(idx, 1);
        }
        // If no locales left, delete the entry
        if (globalMedia[filename].locales.length === 0) {
            delete globalMedia[filename];
        }
    } else {
        console.warn(`Media file not found: ${filename}`);
    }
}

// --- Helper: fetch media file as data URL from backend ---
async function fetchMedia(sessionId) {
  // Fetch media files from backend and populate globalMedia
  const res = await fetch(`/${sessionId}/media/`);
  if (!res.ok) return;
  const files = await res.json();
  files.forEach(fileObj => {
    const { name, data } = fileObj;
    // Guess type and locale from name: e.g. Screenshot_en_12345.png
    const parts = name.split('_');
    const type = parts[0];
    const locale = parts[1] || 'all';
    let mime = '';
    if (name.match(/\.(jpg|jpeg)$/i)) mime = 'image/jpeg';
    else if (name.match(/\.png$/i)) mime = 'image/png';
    else if (name.match(/\.webp$/i)) mime = 'image/webp';
    else if (name.match(/\.mp4$/i)) mime = 'video/mp4';
    else if (name.match(/\.webm$/i)) mime = 'video/webm';
    else mime = 'application/octet-stream';
    const dataUrl = `data:${mime};base64,${data}`;
    addToGlobalMedia(name, dataUrl, locale);
  });
  renderMedia();
}

function dataURLToBlob(dataUrl) {
  // Split the data URL into [header, data]
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : '';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function addListing() {
  const lang = prompt("Enter new language code (e.g. 'en', 'fr', 'de'):");
  if (!lang) return;
  if (!metadata.listings) metadata.listings = {};
  if (metadata.listings[lang]) {
    alert("Listing already exists for this language.");
    return;
  }
  metadata.listings[lang] = {
    baseListing: {
      title: '',
      description: '',
      features: [],
      releaseNotes: '',
      minimumHardware: [],
      images: [],
    },
    platformOverrides: {}
  };
  saveCurrentListing();
  currentListingKey = lang;
  populateListingDropdown();
  await loadListing();
}

function populateListingDropdown() {
  const select = document.getElementById('listingSelect');
  if (!select) return;
  select.innerHTML = '';
  const keys = Object.keys(metadata.listings || {});
  keys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  });
  if (!currentListingKey || !keys.includes(currentListingKey)) {
    currentListingKey = keys[0];
  }
  select.value = currentListingKey;
}

async function removeListing() {
  if (!currentListingKey || !metadata.listings || !metadata.listings[currentListingKey]) return;
  if (Object.keys(metadata.listings).length === 1) {
    alert("At least one listing is required.");
    return;
  }
  if (!confirm(`Remove listing for "${currentListingKey}"?`)) return;
  delete metadata.listings[currentListingKey];
  const keys = Object.keys(metadata.listings);
  currentListingKey = keys[0];
  populateListingDropdown();
  await loadListing();
}


// --- Switch listing: save current, switch, load new ---
async function switchListing(lang) {
  saveCurrentListing();
  currentListingKey = lang;
  await loadListing();
}

function deleteScreenshot(filename) {
  removeFromGlobalMedia(filename);
  console.log(`Deleted screenshot: ${filename}`);
  renderMedia();
}


async function uploadScreenshots() {
const input = document.getElementById('screenshotUpload');
  if (!input.files.length) return;
  Array.from(input.files).forEach(file => {
    addMediaFile(file, MediaType.SCREENSHOT, currentListingKey);
  });
    input.value = ""; // Clear the input after use
  renderMedia();      
}

async function uploadTrailerImage() {
  const input = document.getElementById('trailerImageUpload');
  if (!input.files.length) return;
  addMediaFile(input.files[0], MediaType.TRAILER_IMAGE, currentListingKey);
    input.value = ""; // Clear the input after use
  renderMedia();      
}

async function uploadTrailer() {
  const input = document.getElementById('trailerUpload');
  if (!input.files.length) return;
  addMediaFile(input.files[0], MediaType.TRAILER, currentListingKey);
    input.value = ""; // Clear the input after use
  renderMedia();      
}

function addListItem(listId) {
  let arr;
  if (listId === 'features') {
    arr = featuresArr;
  } else if (listId === 'hardware') {
    arr = hardwareArr;
  } else {
    return;
  }
  arr.push('');
  renderList(listId, arr);
}

// --- Render all media for current locale ---
function renderMedia() {
  // Screenshots
  const localMedia = Object.values(globalMedia).filter(
    m => m.locales && m.locales.includes(currentListingKey)
  );
  const screenshots = Object.values(localMedia).filter(
    m => m.type === MediaType.SCREENSHOT 
  );
  renderMediaGrid('screenshots', screenshots, "Screenshot");

  // Trailer Image
  const trailerImages = Object.values(localMedia).filter(
    m => m.type === MediaType.TRAILER_IMAGE 
  );
  renderMediaGrid('trailerImageMedia', trailerImages, "Trailer Image");

  // Trailer Video
  const trailers = Object.values(localMedia).filter(
    m => m.type === MediaType.TRAILER 
  );
  renderMediaGrid('trailerMedia', trailers, "Trailer");

  // Icon (if you want to support it)
  const icons = Object.values(localMedia).filter(
    m => m.type === MediaType.ICON
  );
  renderIcon(icons.length ? icons[0].dataUrl : null);
  
}

// --- Call renderMedia in loadListing and after uploads ---
async function loadListing() {
  if (!currentListingKey || !metadata.listings || !metadata.listings[currentListingKey]) {
    baseListing = {};
    document.getElementById('title').value = '';
    document.getElementById('description').value = '';
    featuresArr = [];
    renderList('features', featuresArr);
    document.getElementById('releaseNotes').value = '';
    hardwareArr = [];
    renderList('hardware', hardwareArr);
    renderMedia();
    return;
  }
  const listing = metadata.listings[currentListingKey];
  baseListing = listing.baseListing || {};
  document.getElementById('title').value = baseListing.title || '';
  document.getElementById('description').value = baseListing.description || '';
  featuresArr = baseListing.features ? [...baseListing.features] : [];
  renderList('features', featuresArr);
  document.getElementById('releaseNotes').value = baseListing.releaseNotes || '';
  hardwareArr = baseListing.minimumHardware ? [...baseListing.minimumHardware] : [];
  renderList('hardware', hardwareArr);
  renderMedia();
}

function saveCurrentListing() {
  if (!currentListingKey || !metadata.listings || !metadata.listings[currentListingKey]) return;
  const baseListing = metadata.listings[currentListingKey].baseListing;
  baseListing.title = document.getElementById('title').value;
  baseListing.description = document.getElementById('description').value;
  baseListing.features = [...featuresArr];
  baseListing.releaseNotes = document.getElementById('releaseNotes').value;
  baseListing.minimumHardware = [...hardwareArr];
}

// --- When loading, set per-listing media arrays and call loadListing as async ---
async function initialLoad() {
  const res = await fetch(`/${sessionId}`);
  if (res.status === 404) {
    alert("Session not found. Please check the session ID in the URL.");
    document.querySelector('.container').innerHTML = '';
    return;
  }
  const data = await res.json();
  metadata = data.metadata;
  currentListingKey = Object.keys(metadata.listings || {})[0] ;
  if (!currentListingKey) {
    addListing(); // If no listings, create one
    currentListingKey = Object.keys(metadata.listings || {})[0] ;
  }
  populateListingDropdown();
  await loadListing();
  document.getElementById('pricing').value = (metadata.pricing && metadata.pricing.priceId) || 'Free';
  fetchMedia(sessionId);
  document.getElementById('category').value = metadata.applicationCategory || '';
  document.getElementById('visibility').value = metadata.visibility || '';
  document.getElementById('publishMode').value = metadata.targetPublishMode || '';
  document.getElementById('publishDate').value = metadata.targetPublishDate ? metadata.targetPublishDate.split('T')[0] : '';
  document.getElementById('trial').value = (metadata.pricing && metadata.pricing.trialPeriod) || '';
  document.getElementById('backup').value = metadata.automaticBackupEnabled ? 'true' : 'false';
  document.getElementById('inapp').value = metadata.hasExternalInAppProducts ? 'true' : 'false';
  document.getElementById('accessibility').value = metadata.meetAccessibilityGuidelines ? 'true' : 'false';
}


//143 write generic media file deleter
function changeIcon(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (!file.type.startsWith('image/')) {
    alert("Please upload a valid image file for the icon.");
    return;
  }
  iconFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    iconDataUrl = e.target.result;
    renderIcon(iconDataUrl);
    addMediaFile(file, MediaType.ICON, currentListingKey);
  };
  reader.readAsDataURL(file);
}

function addPrivacypolicy() {
  for (const listingKey in metadata.listings) {
      metadata.listings[listingKey].baseListing.privacyPolicy = "https://www.apple.com/legal/privacy/en-ww/";
  }
}

// --- Approve: upload only current listing's media ---
async function approve() {
  saveCurrentListing();
  saveNonListingMetadata();
  const formData = new FormData();

  addPrivacypolicy();

  Object.entries(globalMedia).forEach(([filename, media]) => {
      formData.append('files', dataURLToBlob(media.dataUrl), filename);
  });

  formData.append('metadata', JSON.stringify(metadata));

    // debugging
//   console.log(JSON.stringify(metadata, null, 2));
//     for (let pair of formData.getAll('files')) {
//         console.log(pair instanceof File ? pair.name : pair);
//     }
//     return;

  await fetch(`/${sessionId}/complete`, {
    method: 'POST',
    body: formData
  }).then(res => res.json());

  alert("Saved and Approved!");
}

initialLoad();



  
// Render screenshots (no type check needed)

function renderIcon(dataUrl) {
  const iconDiv = document.getElementById('icon');
  // Remove any previous icon image
  const oldImg = iconDiv.querySelector('img');
  if (oldImg) iconDiv.removeChild(oldImg);
  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = "App Icon";
    img.style.maxWidth = "120px";
    img.style.maxHeight = "120px";
    img.style.display = "block";
    img.style.marginBottom = "8px";
    iconDiv.insertBefore(img, iconDiv.firstChild);
  }
}

function renderList(containerId, arr) {
  const ul = document.getElementById(containerId);
  ul.innerHTML = '';
  arr.forEach((item, idx) => {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.value = item;
    input.oninput = function() {
      arr[idx] = input.value;
    };
    li.appendChild(input);

    const delBtn = document.createElement('button');
    delBtn.className = 'remove-btn';
    delBtn.innerHTML = '&times;';
    delBtn.onclick = function() {
      arr.splice(idx, 1);
      renderList(containerId, arr);
    };
    li.appendChild(delBtn);

    ul.appendChild(li);
  });
}


function renderMediaGrid(containerId, arr, label) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  arr.forEach((item, idx) => {
    const src = item.dataUrl;
    const wrap = document.createElement('div');
    wrap.className = 'media-thumb';
    let mediaElem;
    // Check if src is a data URL and determine its media type
    if (src.startsWith('data:video/')) {
      mediaElem = document.createElement('video');
      mediaElem.src = src;
      mediaElem.controls = true;
    }
    else{
      mediaElem = document.createElement('img');
      mediaElem.src = src;
    }
    wrap.appendChild(mediaElem);
    const lbl = document.createElement('span');
    lbl.className = 'media-label';
    lbl.innerText = label;
    wrap.appendChild(lbl);

    // Delete button
    if (containerId === 'screenshots') {
      const delBtn = document.createElement('button');
      delBtn.className = 'remove-btn';
      delBtn.innerHTML = '&times;';
      delBtn.style.position = 'absolute';
      delBtn.style.top = '4px';
      delBtn.style.right = '4px';
      delBtn.onclick = function() {
        deleteScreenshot(item.filename);
      };
      wrap.appendChild(delBtn);
    }
    container.appendChild(wrap);
  });
}