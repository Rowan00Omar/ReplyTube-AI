import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const appContent = document.getElementById("app-content");
const signInPrompt = document.getElementById("signInPrompt");
const signOutBtn = document.getElementById("signOutBtn");
const signInBtn = document.getElementById("googleSignin");
const googleSheetOption = document.getElementById("googleSheetOptions");
const sheetUrlInput = document.getElementById("sheetUrl");
const sheetNameInput = document.getElementById("sheetName");
const googleSheetRadio = document.querySelector(
  'input[type="radio"][name="outputMode"][value="google_sheet"]'
);

const results = document.getElementById("results");
const resultTable = document.querySelector("#resultTable tbody");
const successNote = document.getElementById("successNote");
const submitBtn = document.getElementById("submitBtn");
const generationStatus = document.getElementById("generationStatus");

const licenseSection = document.getElementById("licenseSection");
const basicPlan = document.getElementById("basicPlan");
const basicPlanBtn = document.getElementById("basicPlanBtn");
const proPlan = document.getElementById("proPlan");
const proPlanBtn = document.getElementById("proPlanBtn");
const upgradeNote = document.getElementById("upgradeNote");

const baseURL = "https://youtube-comment-replier-production.up.railway.app";

let app;
let auth;

function showConnectionError() {
  const alert = document.getElementById("error-alert");
  alert.classList.remove("d-none");
  alert.textContent =
    "🚫 No internet connection. Please check your connection and try again.";
}

async function loadEnv() {
  const env = await fetch(baseURL + "/get-secret").then((res) => res.json());

  // 1. Initialize Firebase
  const firebaseConfig = {
    apiKey: env.FB_API_KEY,
    authDomain: "comment-replier-9dcd2.firebaseapp.com",
    projectId: "comment-replier-9dcd2",
    storageBucket: "comment-replier-9dcd2.firebasestorage.app",
    messagingSenderId: "610375916382",
    appId: env.FB_APP_ID,
    measurementId: "G-E2W9YL40FT",
  };

  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
}

// On page load
async function checkSession() {
  try {
    const lastLogin = sessionStorage.getItem("lastSuccessfulLogin");
    // within 10 minutes
    if (lastLogin && Date.now() - parseInt(lastLogin) < 10 * 60 * 1000) {
      console.log("Recent session detected, skipping session check.");
      showApp();
      const plan = sessionStorage.getItem("plan");
      checkPlan(plan && plan == "pro" ? proPlan : basicPlan);
      return;
    }

    // Auto-login if already signed in
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const exp = user.stsTokenManager.expirationTime;

          if (Date.now() >= exp) {
            console.warn("⏰ Token expired. Trying to re-auth");
            return;
          }
          const email = sessionStorage.getItem("email");
          const plan = sessionStorage.getItem("plan");
          if (email && plan) {
            showSignOutButton(email);
            showApp();
            checkPlan(plan);
          } else {
            console.log("You need to login again");
            showLogin();
          }
        } catch (e) {
          console.log("error in login: ", e.message || e.toString());
          showLogin();
        }
      } else {
        console.log("not login");
        showLogin();
      }
    });
  } catch (err) {
    console.error("Error checking session:", err);
    // await loginFromFB();
  }
}

function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // Stop listening after getting user
      if (user) {
        resolve(user);
      } else {
        reject(new Error("No user is signed in"));
      }
    });
  });
}

function checkPlan(plan) {
  if (plan == "pro") {
    setCurrentPlanBadgeOnElem(proPlan);
    proPlanBtn.disabled = true;
    basicPlanBtn.disabled = false;
  } else {
    setCurrentPlanBadgeOnElem(basicPlan);
    proPlanBtn.disabled = false;
    basicPlanBtn.disabled = true;
  }

  checkGoogleSheet(plan);
}

async function changePlan(newPlan, licenseKey = null) {
  const user = auth.currentUser || (await getCurrentUser());
  console.log("upgrade user", user);

  if (user) {
    const idToken = await user.getIdToken();
    console.log("token in upgrade", idToken);

    if (!idToken) {
      throw new Error("Invalid token. Please login");
    }

    const res = await fetch(baseURL + "/changePlan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + idToken,
      },
      body: JSON.stringify({
        email,
        license_key: licenseKey,
        new_plan: newPlan,
      }),
    });
    const data = await res.json();

    console.log("data ");
    console.log(data);

    if (!res.ok || !data.success) {
      console.log(data);
      throw new Error("Error changing plan");
    }

    return data;
  } else {
    console.warn("No user is logged in");
    return {
      success: false,
    };
  }
}

function extractVideoId(url) {
  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function downloadExcel(data, videoId) {
  let csv = "Comment,Reply,Comment ID\n";
  data.forEach((r) => {
    csv +=
      `"${r.comment.replace(/"/g, '""')}",` +
      `"${r.reply.replace(/"/g, '""')}",` +
      `"${(r.comment_id || "").replace(/"/g, '""')}"\n`; // Handle missing IDs safely
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `youtube_replies_${videoId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function showApp() {
  signInPrompt.classList.add("d-none");
  appContent.classList.remove("d-none");
}

function showLogin() {
  signInPrompt.classList.remove("d-none");
  appContent.classList.add("d-none");
}

function showSignOutButton(userEmail) {
  signOutBtn.classList.add("d-inline");
  signOutBtn.classList.remove("d-none");
  signOutBtn.title = userEmail;

  signInBtn.classList.add("d-none");
  // signOutBtn.innerText = "Log Out";
}

function hideSignOutButton() {
  signOutBtn.classList.add("d-none");
  signOutBtn.title = "Sign in";
  signInBtn.classList.add("d-inline");
}

function setGenerationStatus(status) {
  generationStatus.innerText = status;
  generationStatus.classList.remove("d-none");
}
function hideGenerationStatus() {
  generationStatus.classList.add("d-none");
}

// Preload session
window.addEventListener("DOMContentLoaded", async () => {
  hideGenerationStatus();

  try {
    await loadEnv();
    await checkSession();
  } catch (e) {
    console.log("something wrong ", e.message || e.toString());
    showLogin();
  }
});

/* ----------- Main app  ------------ */

signInBtn.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const token = await user.getIdToken();

    // Send token to backend
    const res = await fetch(baseURL + "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    // console.log("Backend response:", data);
    sessionStorage.setItem("lastSuccessfulLogin", Date.now().toString());
    sessionStorage.setItem("email", data["user"]["email"]);
    sessionStorage.setItem("plan", data["user"]["plan"]);

    if (res.ok) location.reload();
  } catch (e) {
    console.error("Google sign-in failed:", e);
  }
});

document.getElementById("loginButton").addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const token = await user.getIdToken();

    // Send token to backend
    const res = await fetch(baseURL + "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    sessionStorage.setItem("lastSuccessfulLogin", Date.now().toString());
    sessionStorage.setItem("email", data["user"]["email"]);
    sessionStorage.setItem("plan", data["user"]["plan"]);

    if (res.ok) location.reload();
  } catch (e) {
    console.error("Google sign-in failed:", e);
  }
});

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(firebaseAuth); // Firebase sign out
    console.log("🔓 Signed out from Firebase");

    // Optional: tell your backend too
    await fetch(baseURL + "/logout", {
      method: "POST",
      credentials: "include",
    });

    // Clear session/local data
    sessionStorage.removeItem("plan");
    sessionStorage.removeItem("email");
    sessionStorage.removeItem("lastSuccessfulLogin");

    hideSignOutButton();
    showLogin();

    console.log("🔁 User has been logged out.");
  } catch (err) {
    console.error("Sign out failed:", err);
  }
});

// Show Google sheet inputs
document.querySelectorAll('input[name="outputMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    const show = input.value === "google_sheet";
    googleSheetOption.classList.toggle("d-none", !show);
  });
});

// TODO: check functionality
document
  .getElementById("generateRepliesForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    setGenerationStatus("Generating...");

    try {
      const user = auth.currentUser || (await getCurrentUser());
      // console.log("generte user", user);

      if (user) {
        const idToken = await user.getIdToken();

        const url = document.getElementById("vidoeUrl").value.trim();
        const videoId = extractVideoId(url);

        if (!videoId) {
          alert("Please enter a valid YouTube video URL.");
          submitBtn.disabled = false;
          return;
        }

        const channelId = document.getElementById("channelId").value.trim();
        if (!channelId) {
          alert("Please enter your YouTube channel ID.");
          submitBtn.disabled = false;
          return;
        }

        const authorDisplayName = document
          .getElementById("authorDisplayName")
          .value.trim();
        if (authorDisplayName && !authorDisplayName.startsWith("@")) {
          alert("Please enter valid display name.");
          submitBtn.disabled = false;
          return;
        }

        const vidoeSummary = document
          .getElementById("vidoeSummary")
          .value.trim();

        const outputMode = document.querySelector(
          'input[name="outputMode"]:checked'
        ).value;

        if (outputMode === "google_sheet" && !sheetUrl) {
          alert("Please provide a Google Sheet URL.");
          submitBtn.disabled = false;
          return;
        }

        const sheetUrl = sheetUrlInput.value.trim();
        const sheetName = sheetNameInput.value.trim();

        results.style.display = "none";
        resultTable.innerHTML = "";
        successNote.innerHTML = "";

        try {
          const response = await fetch(baseURL + "/generate-replies", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + idToken,
            },
            body: JSON.stringify({
              video_id: videoId,
              channel_id: channelId,
              author_display_name: authorDisplayName,
              user_summary: vidoeSummary,
              sheet_url: outputMode === "google_sheet" ? sheetUrl : null,
              sheet_name:
                outputMode === "google_sheet" ? sheetName || "Sheet1" : null,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Unknown server error");
          }

          const data = await response.json();

          console.log(data);

          results.style.display = "block";

          successNote.innerHTML =
            outputMode === "google_sheet"
              ? `Saved to Google Sheet: <a href="${sheetUrl}" target="_blank">${sheetUrl}</a>`
              : "Your Excel file has been generated.";

          data["replies"].forEach((pair) => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${sanitize(pair.comment)}</td><td>${sanitize(
              pair.reply
            )}</td>`;
            resultTable.appendChild(row);
          });

          if (
            outputMode === "excel" &&
            data["replies"] &&
            data["replies"].length > 0
          ) {
            downloadExcel(data["replies"], videoId);
          }

          submitBtn.disabled = false;
          hideGenerationStatus();
        } catch (err) {
          console.error(err);
          submitBtn.disabled = false;
          const error = err.message || err.toString();
          if (error.includes("Video Details Error")) setGenerationStatus(error);
        }
      } else {
        console.error("user not logged in in generate");
        showLogin();
        // hideGenerationStatus();
      }
    } catch (e) {
      submitBtn.disabled = false;
      const err = e.message || e.toString();
      if (err.includes("No user is signed in")) {
        showLogin();
      }
      console.log("Error: " + err);
      setGenerationStatus("Error occured");
    }
  });

/* ----------- change plan  ------------ */
function checkGoogleSheet(plan) {
  if (!plan) {
    alert("Something wrong in plan");
  }

  if (plan === "basic") {
    upgradeNote.classList.remove("d-none");
    googleSheetRadio.disabled = true;
    googleSheetOption.disabled = true;
    sheetUrlInput.disabled = true;
    sheetNameInput.disabled = true;

    // Optional: add visual cue
    googleSheetOption.style.opacity = 0.5;
  } else {
    upgradeNote.classList.add("d-none");
    googleSheetRadio.disabled = false;
    googleSheetOption.disabled = false;
    sheetUrlInput.disabled = false;
    sheetNameInput.disabled = false;

    // Optional: add visual cue
    googleSheetOption.style.opacity = 1;
  }
}

function setCurrentPlanBadgeOnElem(topParentElement) {
  const span = document.createElement("span");
  span.classList.add(
    ...[
      "badge",
      "bg-primary",
      "text-white",
      "text-uppercase",
      "text-wrap",
      "px-3",
      "py-2",
      "small",
    ]
  );
  span.innerText = "Currently Selected";
  if (topParentElement) {
    const parent = topParentElement.querySelector("h5").parentElement;
    parent.append(span);
  }
}

basicPlanBtn.addEventListener("click", async (event) => {
  try {
    const ret = await changePlan("basic");
    if (ret.success == true) {
      // Save user token/API key locally
      sessionStorage.setItem("plan", "basic");

      appContent.classList.remove("d-none");
      event.target.disabled = true;
      proPlanBtn.disabled = false;
    } else {
      event.target.disabled = false;
      proPlanBtn.disabled = true;
    }
  } catch (e) {
    console.log("Error in changing to basic: " + e.message || e.toString());
    event.target.disabled = false;
    proPlanBtn.disabled = true;
  }
});

proPlanBtn.addEventListener("click", (e) => {
  // window.open(
  //   "https://rowanomar.gumroad.com/l/ReplyTubAI",
  //   "_blank"
  // );
  licenseSection.classList.remove("d-none");
  e.target.innerText = "Enter License ↓";
  e.target.disabled = true;
});

document.getElementById("upgradeBtn").addEventListener("click", async () => {
  // Check license from backend
  const licenseKey = document.getElementById("licenseKey").value.trim();
  const licenseStatus = document.getElementById("licenseStatus");

  if (!licenseKey) {
    licenseStatus.textContent = "Please enter a license key.";
    licenseStatus.classList.remove("d-none");
    proPlanBtn.disabled = false;
    basicPlanBtn.disabled = true;
    return;
  }

  licenseStatus.classList.add("d-none");

  try {
    const ret = await changePlan("pro", licenseKey);

    if (ret && ret.success == true) {
      // Save user token/API key locally
      sessionStorage.setItem("plan", "pro");
      sessionStorage.setItem("license_key", licenseKey);

      checkPlan(proPlan);

      licenseStatus.classList.add("d-none");
      licenseSection.classList.add("d-none");
      appContent.classList.remove("d-none");
      licenseKey.disabled = true;
    } else {
      checkPlan(basicPlan);

      licenseStatus.classList.remove("d-none");
      licenseKey.disabled = false;
      console.log("error in ret", ret);
    }
  } catch (e) {
    console.log(e);
    proPlanBtn.disabled = false;
    basicPlanBtn.disabled = true;
    //TODO: make sure the login container is shown
  }
});
