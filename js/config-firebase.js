/* Cấu hình Firebase - BẠN CẦN THAY THẾ BẰNG THÔNG TIN CỦA MÌNH */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCoYt9ExOWoPdu7-PTfstWJbBvq9uTvF-o",
  authDomain: "vex-e3600.firebaseapp.com",
  databaseURL: "https://vex-e3600-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vex-e3600",
  storageBucket: "vex-e3600.appspot.com",
  messagingSenderId: "544057371159",
  appId: "1:544057371159:web:6a9c5c234f55daed364a52",
  measurementId: "G-GBLKQF5N0R"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Khởi tạo và xuất các dịch vụ Firebase
export const db = getDatabase(app);
export const auth = getAuth(app);