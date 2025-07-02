const ALL_LOCALES = window.ALL_LOCALES;
const sessionId = window.location.pathname.split('/')[2]; // e.g., /preview/SESSION_ID or /preview/SESSION_ID/submission_id
console.log("Session ID from URL:", sessionId);
if (!sessionId) {
  alert("Session ID is required in the URL (e.g. ?session=12345)");
  document.querySelector('.container').innerHTML = '';
  throw new Error("Session ID not provided");
}

// globalMedia[filename] = {
//     filename,
//     dataUrl,
//     type:getMediaType(filename),
//     locales : [...ALL_LOCALES],
//     };

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
  try {
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- Use enum for getMediaType ---
function getMediaType(originalname) {
  try{
  for (const type of Object.values(MediaType)) {
    if (originalname.split('_')[0]===(type)) return type;
  }
  alert(`Unknown media type for file: ${originalname}`);
  throw new Error(`Unknown media type for file: ${originalname}`);
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- Global media object ---
const globalMedia = {}; // { filename: { file, dataUrl, type, locale } }

// --- Helper: Add file to globalMedia with prefix ---
async function addMediaFile(file, type, locale, filename = `${type}_${locale}_${Date.now()}.${file.name.split('.').pop()}`) {
  try {
    await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        addToGlobalMedia(filename, e.target.result, locale);
        resolve();
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function addToGlobalMedia(filename, dataUrl, locale) {
  try {
    if(locale.startsWith("all")){
      const exclude_list = locale.slice(4).split(',');
      const filteredLocales = ALL_LOCALES.filter(loc => !exclude_list.includes(loc.toLowerCase().trim()));
      globalMedia[filename] = {
        filename,
        dataUrl,
        type:getMediaType(filename),
        locales : [...filteredLocales],
      };
    } else {
      globalMedia[filename] = {
        filename,
        dataUrl,
        type:getMediaType(filename),
        locales : [...locale.split(',').map(loc => loc.trim())],
      };
    }
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function removeFromGlobalMedia(filename) {
  try {
    if (globalMedia[filename]) {
        // Remove currentListingKey from the locales array
        const idx = globalMedia[filename].locales.indexOf(currentListingKey);
        if (idx !== -1) {
            globalMedia[filename].locales.splice(idx, 1);
        }
        // console.log(`Removed locale "${currentListingKey}" from media file: ${filename}, locales now: ${globalMedia[filename].locales.join(', ')}`);
        // If no locales left, delete the entry
        if (globalMedia[filename].locales.length === 0) {
            delete globalMedia[filename];
            // console.log(`Media file ${filename} removed from globalMedia.`);
        }
        // console.log("done");

    } else {
        console.warn(`Media file not found: ${filename}`);
    }
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- Helper: fetch media file as data URL from backend ---
async function fetchMedia(sessionId) {
  try{
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function dataURLToBlob(dataUrl) {
  try{
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function addListing(lang) {
  try{
  if (!lang) return;
  if (metadata.listings[lang]) {
    alert("Listing already exists for this language.");
    return;
  }
  if (!metadata.listings) metadata.listings = {};
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
  loadListing();
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function populateListingDropdown() {
  try{
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function removeListing() {
  try{
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
  loadListing();
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}


// --- Switch listing: save current, switch, load new ---
function switchListing(lang) {
  try{
  saveCurrentListing();
  currentListingKey = lang;
  loadListing();
  console.log(`Switched to listing: ${currentListingKey}`);
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function deleteImage(filename) {
  try{
  removeFromGlobalMedia(filename);
  // console.log(`Deleted: ${filename}`);
  renderMedia();
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}


async function uploadScreenshots(input) {
  try{
  if (!input.files.length) return;
    for (const file of input.files) {
      await addMediaFile(file, MediaType.SCREENSHOT, currentListingKey);
    }
    input.value = ""; // Clear the input after use
    console.log("Screenshots uploaded:", input.files);
  renderMedia();      
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

async function uploadTrailerImage(input) {
  try{
  if (!input.files.length) return;
  await addMediaFile(input.files[0], MediaType.TRAILER_IMAGE, currentListingKey,filename = `TrailerImage_${currentListingKey}_${currentListingKey}-asset.${input.files[0].name.split('.').pop()}`);
    input.value = ""; // Clear the input after use
  renderMedia();      
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

async function uploadTrailer(input) {
  try{
  if (!input.files.length) return;
  await addMediaFile(input.files[0], MediaType.TRAILER, currentListingKey, filename = `Trailer_${currentListingKey}_${currentListingKey}-asset.${input.files[0].name.split('.').pop()}`);
  input.value = ""; // Clear the input after use
  renderMedia();      
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function addListItem(listId) {
  try{
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- Render all media for current locale ---
function renderMedia() {
  try{
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
  
  // Icon 
  const icons = Object.values(localMedia).filter(
    m => m.type === MediaType.ICON
  );
  renderIcon(icons[0]);
  console.log("Rendering media:", currentListingKey);
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- Call renderMedia in loadListing and after uploads ---
function loadListing() {
  try{
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function saveCurrentListing() {
  try{
  if (!currentListingKey || !metadata.listings || !metadata.listings[currentListingKey]) return;
  const baseListing = metadata.listings[currentListingKey].baseListing;
  baseListing.title = document.getElementById('title').value;
  baseListing.description = document.getElementById('description').value;
  baseListing.features = [...featuresArr];
  baseListing.releaseNotes = document.getElementById('releaseNotes').value;
  baseListing.minimumHardware = [...hardwareArr];
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- When loading, set per-listing media arrays and call loadListing  ---
async function initialLoad() {
  try{
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
  await fetchMedia(sessionId);
  populateListingDropdown();
  loadListing();
  document.getElementById('pricing').value = (metadata.pricing && metadata.pricing.priceId) || 'Free';
  document.getElementById('category').value = metadata.applicationCategory || '';
  document.getElementById('visibility').value = metadata.visibility || '';
  document.getElementById('publishMode').value = metadata.targetPublishMode || '';
  document.getElementById('publishDate').value = metadata.targetPublishDate ? metadata.targetPublishDate.split('T')[0] : '';
  document.getElementById('trial').value = (metadata.pricing && metadata.pricing.trialPeriod) || 'NoFreeTrial';
  document.getElementById('backup').value = metadata.automaticBackupEnabled ? 'true' : 'false';
  document.getElementById('inapp').value = metadata.hasExternalInAppProducts ? 'true' : 'false';
  document.getElementById('accessibility').value = metadata.meetAccessibilityGuidelines ? 'true' : 'false';
  console.log("Initial load complete. Current listing key:", currentListingKey);
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}


//143 write generic media file deleter
async function changeIcon(input) {
  try{
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.type !== 'image/png') {
    alert("Please upload a PNG file for the icon.");
    return;
  }

  // Check if the image is 1:1 (square)
  const img = new Image();
  img.onload = async function() {
    if (img.width !== img.height) {
      alert("Icon image must be square (1:1 aspect ratio).");
      return;
    }
    // Remove existing icon if any
    const existingIcon = Object.values(globalMedia).find(
      m => m.type === MediaType.ICON && m.locales.includes(currentListingKey)
    );
    if (existingIcon) {
      deleteImage(existingIcon.filename);
      console.log("Removed existing icon:", existingIcon.filename);
    }
    await addMediaFile(file, MediaType.ICON, currentListingKey);
    renderMedia();
    input.value = ""; // Clear the input after use
  };
  img.onerror = function() {
    alert("Failed to load image. Please upload a valid PNG file.");
  };
  img.src = URL.createObjectURL(file);
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// make file names consistent across locales
function make_globalMedia_consistent() {
  try{
  for (const [filename, media] of Object.entries(globalMedia)) {
    const parts = filename.split('_');
    // filename format: type_locale_timestamp.ext
    if (parts.length < 3) continue;
    const locale = parts[1];
    console.log(`Processing file: ${filename} with locale: ${locale}`);
    if (locale.startsWith("all")) {
      // If locale is "all", we need to ensure all locales are included
      const exclude_list = locale.slice(4).split(',').filter(Boolean);
      const filteredLocales = ALL_LOCALES.filter(loc => !exclude_list.includes(loc));
      // Find locales present in filteredLocales but not in media.locales
      const removed_locales = filteredLocales.filter(loc => !media.locales.includes(loc));
      console.log(`Removed locales: ${removed_locales}`);

      if (removed_locales.length === 0) {
        // If no locales were removed, keep the original filename
        globalMedia[filename].filename = filename;
      } else {
        let new_locale;
        if (exclude_list.length > 0) {
          // already format excludes some locales, append removed_locales
          new_locale = `${locale}#${removed_locales.join(',')}`;
        } else {
          // format the filename to include removed locales
          // e.g. Screenshot_all#en,fr,de_12345.png
          new_locale = `${locale}#${removed_locales.join(',')}`;
        }
        globalMedia[filename].filename = `${parts[0]}_${new_locale}_${parts.slice(2).join('_')}`;
        console.log(`Updated filename: ${globalMedia[filename].filename}`);
      }
    } else {
      console.log(`Current locales: ${media.locales.join(',')}`);
      // For regular locales, just ensure the filename is consistent
      globalMedia[filename].filename = `${parts[0]}_${media.locales.join(',')}_${parts.slice(2).join('_')}`;
    }
  }
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// --- Approve: upload only current listing's media ---
async function approve() {
  try{
  saveCurrentListing();
  saveNonListingMetadata();

  // Validate metadata before proceeding
  const errors = validateMetadata(metadata);
  if (errors.length > 0) {
    alert("Please fix the following errors before submitting:\n\n" + errors.join('\n'));
    return;
  }

  const formData = new FormData();
  make_globalMedia_consistent();

  Object.entries(globalMedia).forEach(([_, media]) => {
    formData.append('files', dataURLToBlob(media.dataUrl), media.filename);
  });

  formData.append('metadata', JSON.stringify(metadata));

  await fetch(`/${sessionId}/complete`, {
    method: 'POST',
    body: formData
  }).then(res => res.json());

  alert("Saved and Approved!");
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

  initialLoad();



  
// Render screenshots (no type check needed)

function renderIcon(file) {
  try{
  const iconDiv = document.getElementById('icon');
  // Remove any previous icon image and delete button
  while (iconDiv.firstChild) {
    iconDiv.removeChild(iconDiv.firstChild);
  }
  if (!file) {
    return;
  }
  const dataUrl = file.dataUrl;
  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = "App Icon";
    img.style.maxWidth = "120px";
    img.style.maxHeight = "120px";
    img.style.display = "block";
    img.style.marginBottom = "8px";
    const delBtn = document.createElement('button');
    delBtn.className = 'remove-btn';
    delBtn.innerHTML = '&times;';
    delBtn.style.position = 'absolute';
    delBtn.style.top = '4px';
    delBtn.style.right = '4px';
    delBtn.onclick = function() {
      // Remove icon from globalMedia for current locale
      const iconEntry = Object.values(globalMedia).find(
        m => m.type === MediaType.ICON && m.locales.includes(currentListingKey)
      );
      if (iconEntry) {
        deleteImage(iconEntry.filename);
        renderIcon(null);
      }
    };
    iconDiv.style.position = 'relative';
    iconDiv.appendChild(delBtn);
    iconDiv.insertBefore(img, iconDiv.firstChild);
  }
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function renderList(containerId, arr) {
  try{
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
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}


function renderMediaGrid(containerId, arr, label) {
  try{
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
    // if (containerId === 'screenshots') {
      const delBtn = document.createElement('button');
      delBtn.className = 'remove-btn';
      delBtn.innerHTML = '&times;';
      delBtn.style.position = 'absolute';
      delBtn.style.top = '4px';
      delBtn.style.right = '4px';
      delBtn.onclick = function() {
        deleteImage(item.filename);
      };
      wrap.appendChild(delBtn);
    // }
    container.appendChild(wrap);
  });
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function validateMetadata(metadata) {
  try{
  const errors = [];

  // Application Category (required)
  if (!metadata.applicationCategory || metadata.applicationCategory.trim() === "") {
    errors.push("Application Category is required.");
  }

  // Visibility (required)
  if (!metadata.visibility || metadata.visibility.trim() === "") {
    errors.push("Visibility is required.");
  }

  // Target Publish Mode (required)
  if (!metadata.targetPublishMode || metadata.targetPublishMode.trim() === "") {
    errors.push("Target Publish Mode is required.");
  }

  // Target Publish Date (required)
  if (!metadata.targetPublishDate || metadata.targetPublishDate.trim() === "") {
    if(metadata.targetPublishMode.toLowerCase()==="manual"){
    errors.push("Target Publish Date is required.");
  }}

  // Pricing (required)
  if (!metadata.pricing || !metadata.pricing.priceId || metadata.pricing.priceId.trim() === "") {
    errors.push("Pricing (Price ID) is required.");
  }

  if(metadata.pricing && !metadata.pricing.trialPeriod.trim() === "") {
    metadata.pricing.trialPeriod = "NoFreeTrial"; // Default value if not set
  }

  // Listings (at least one required)
  if (!metadata.listings || Object.keys(metadata.listings).length === 0) {
    errors.push("At least one listing (language) is required.");
  } else {
    // Validate each listing
    Object.entries(metadata.listings).forEach(([lang, listing]) => {
      if (!listing.baseListing) {
        errors.push(`Base listing is missing for language: ${lang}`);
        return;
      }
      if (!listing.baseListing.title || listing.baseListing.title.trim() === "") {
        errors.push(`Title is required for listing: ${lang}`);
      }
      if (!listing.baseListing.description || listing.baseListing.description.trim() === "") {
        errors.push(`Description is required for listing: ${lang}`);
      }
      // Features, releaseNotes, minimumHardware, images are optional
    });
  }

  // Icon (required for at least one locale)
  // const hasIcon = Object.values(globalMedia).some(
  //   m => m.type === MediaType.ICON && m.locales && m.locales.length > 0
  // );
  // if (!hasIcon) {
  //   errors.push("At least one App Icon is required.");
  // }

  // Screenshots (at least one required for at least one locale)
  const hasScreenshot = Object.values(globalMedia).some(
    m => m.type === MediaType.SCREENSHOT && m.locales && m.locales.length > 0
  );
  if (!hasScreenshot) {
    errors.push("At least one Screenshot is required.");
  }

  // Trailer and Trailer Image are optional
  // Accessibility, backup, in-app, etc. are optional (can add more checks if needed)

  return errors;
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function populateAddListingDropdown() {
  try{
  const select = document.getElementById('addListingSelect');
  select.innerHTML = '';
  ALL_LOCALES.forEach(listing => {
    const option = document.createElement('option');
    option.value = listing;
    option.textContent = listing;
    select.appendChild(option);
  });
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function addListingFromDropdown() {
  try{
  const select = document.getElementById('addListingSelect');
  if (select.value) {
    addListing(select.value);
  }
  } catch (err) {
    alert("Error: " + (err && err.message ? err.message : err));
    throw err;
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', populateAddListingDropdown);

