
import ImageKit from "https://cdn.jsdelivr.net/npm/imagekit-javascript@1.5.4/dist/imagekit.esm.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// ====== Firebase ======
const firebaseConfig = {
  apiKey: window._ENV?.FIREBASE_API_KEY || "${FIREBASE_API_KEY}",
  authDomain: window._ENV?.FIREBASE_AUTH_DOMAIN || "${FIREBASE_AUTH_DOMAIN}",
  databaseURL: window._ENV?.FIREBASE_DB_URL || "${FIREBASE_DB_URL}",
  projectId: window._ENV?.FIREBASE_PROJECT_ID || "${FIREBASE_PROJECT_ID}",
  storageBucket: window._ENV?.FIREBASE_STORAGE_BUCKET || "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: window._ENV?.FIREBASE_SENDER_ID || "${FIREBASE_SENDER_ID}",
  appId: window._ENV?.FIREBASE_APP_ID || "${FIREBASE_APP_ID}",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const mediaRef = ref(db, "media");
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ====== ImageKit ======
const imagekit = new ImageKit({
  publicKey: "${IMAGEKIT_PUBLIC_KEY}",
  urlEndpoint: "${IMAGEKIT_URL_ENDPOINT}",
  authenticationEndpoint: "/.netlify/functions/imagekit-auth",
});
  
// دالة تسجيل الدخول
function loginWithGoogle() {
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  if (isLocal) {
    // إذا محلي → استخدم redirect لتجنب مشكلة popup
    console.log("Local environment → using redirect");
    signInWithRedirect(auth, provider)
      .catch(err => console.error("Redirect Error:", err));
  } else {
    // إذا أونلاين → استخدم popup
    console.log("Online environment → using popup");
    signInWithPopup(auth, provider)
      .then(result => {
        console.log("User signed in:", result.user);
      })
      .catch(err => console.error("Popup Error:", err));
  }
}

// زر تسجيل الدخول
document.getElementById("googleLoginBtn").addEventListener("click", loginWithGoogle);
// ====== DOM ======
const authSection = document.getElementById("authSection");
const adminSection = document.getElementById("adminSection");
const emailForm = document.getElementById("emailForm");
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const googleBtn = document.getElementById("googleLoginBtn");
const authMsg = document.getElementById("authMsg");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserEl = document.getElementById("currentUser");

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const uploadList = document.getElementById("uploadList");
const gallery = document.getElementById("gallery");
const defaultAlt = document.getElementById("defaultAlt");
const refreshBtn = document.getElementById("refreshBtn");
const dropzone = document.getElementById("dropzone");

// ====== Helpers ======
function show(el){ el.style.display = ""; }
function hide(el){ el.style.display = "none"; }
function setAuthError(msg){ authMsg.textContent = msg; authMsg.style.display = msg?"block":"none"; }

// ====== Auth Flow ======
onAuthStateChanged(auth, (user)=>{
  if(user){
    hide(authSection); show(adminSection);
    currentUserEl.textContent = user.email || "";
  } else {
    show(authSection); hide(adminSection);
    currentUserEl.textContent = "";
  }
});

googleBtn?.addEventListener("click", async ()=>{
  try{ await signInWithPopup(auth, provider); }
  catch(err){ setAuthError(err.message); }
});

emailForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  try{ await signInWithEmailAndPassword(auth, emailInput.value, passInput.value); }
  catch(err){ setAuthError("فشل تسجيل الدخول. تأكد من البريد وكلمة المرور."); }
});

logoutBtn?.addEventListener("click", ()=> signOut(auth));

// ====== Media UI (only usable when authed) ======
["dragenter","dragover"].forEach(evt=>dropzone?.addEventListener(evt,e=>{e.preventDefault();dropzone.style.background="#eef";}));
["dragleave","drop"].forEach(evt=>dropzone?.addEventListener(evt,e=>{e.preventDefault();dropzone.style.background="#fff";}));
dropzone?.addEventListener("drop",(e)=>{ fileInput.files = e.dataTransfer.files; });

function renderCard(key, item){
  const isVideo = item.type === "video";
  const thumbUrl = isVideo ? item.url + "#t=0.5" : item.url + "?tr=w-400,h-400,fo-auto";
  const card = document.createElement("div");
  card.className = "card position-relative";
  card.innerHTML = `
    <span class="badge text-bg-${isVideo?"dark":"info"} badge-type">${isVideo?"فيديو":"صورة"}</span>
    ${isVideo ?
      `<video class=\"w-100\" src=\"${item.url}\" preload=\"metadata\" controls></video>`:
      `<img class=\"w-100 thumb\" loading=\"lazy\" src=\"${thumbUrl}\" alt=\"${item.alt||""}\">`
    }
    <div class="p-2 d-flex gap-2 align-items-center">
      <input class="form-control form-control-sm" value="${item.alt||""}" placeholder="alt" data-key="${key}"/>
      <button class="btn btn-sm btn-outline-primary save" data-key="${key}">حفظ</button>
      <button class="btn btn-sm btn-outline-danger del" data-key="${key}" data-fileid="${item.fileId||""}">حذف</button>
    </div>
  `;
  return card;
}

function paintGallery(data){
  gallery.innerHTML = "";
  const entries = data ? Object.entries(data).sort((a,b)=> (a[1].order||0)-(b[1].order||0)) : [];
  for (const [key,item] of entries){
    gallery.appendChild(renderCard(key,item));
  }
}

// Live read
onValue(mediaRef, (snap)=>{ paintGallery(snap.val()); });

uploadBtn?.addEventListener("click", async ()=>{
  const user = auth.currentUser; if(!user) return alert("تحتاج لتسجيل الدخول");
  if(!fileInput.files.length) return alert("اختر ملفات أولاً");
  const files = Array.from(fileInput.files);

  for(const file of files){
    const row = document.createElement("div");
    row.className = "border rounded p-2";
    row.innerHTML = `<div class="small mb-1">${file.name}</div><div class="progress"><div class="progress-bar" style="width:0%"></div></div>`;
    uploadList.prepend(row);
    const bar = row.querySelector('.progress-bar');

    try {
      const result = await imagekit.upload({
        file,
        fileName: file.name,
        useUniqueFileName: true,
        tags: ["flowersdz"],
        folder: "/flowersdz",
        progress: (evt) => { if(evt && evt.loaded && evt.total){ bar.style.width = Math.round((evt.loaded/evt.total)*100) + '%'; } }
      });

      await push(mediaRef, {
        url: result.url,
        fileId: result.fileId,
        type: file.type.startsWith("video")?"video":"image",
        alt: (defaultAlt.value || file.name).replace(/\.[^.]+$/, ""),
        order: Date.now(),
        uid: user.uid
      });

      bar.style.width = '100%';
    } catch (err){
      console.error(err);
      row.classList.add('border-danger');
    }
  }

  fileInput.value = "";
});

// Save alt
gallery?.addEventListener('click', async (e)=>{
  if(e.target.classList.contains('save')){
    if(!auth.currentUser) return alert('تحتاج لتسجيل الدخول');
    const key = e.target.dataset.key;
    const input = e.target.parentElement.querySelector('input');
    await update(ref(db, `media/${key}`), { alt: input.value });
    e.target.classList.replace('btn-outline-primary','btn-success');
    e.target.textContent = 'تم';
    setTimeout(()=>{ e.target.classList.replace('btn-success','btn-outline-primary'); e.target.textContent='حفظ'; }, 800);
  }
});

// Delete
gallery?.addEventListener('click', async (e)=>{
  if(e.target.classList.contains('del')){
    if(!auth.currentUser) return alert('تحتاج لتسجيل الدخول');
    const key = e.target.dataset.key;
    const fileId = e.target.dataset.fileid;
    if(!confirm('تأكيد الحذف؟')) return;

    try{
      if(fileId){
        await fetch('/.netlify/functions/imagekit-delete', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fileId })
        });
      }
      await remove(ref(db, `media/${key}`));
    }catch(err){ console.error(err); alert('تعذر الحذف'); }
  }
});

// Manual refresh
refreshBtn?.addEventListener('click', ()=> window.location.reload());







