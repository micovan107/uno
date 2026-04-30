import {
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from './config-firebase.js'; // Import db và auth đã khởi tạo
import { ref, set, get, onDisconnect, serverTimestamp, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const provider = new GoogleAuthProvider();

// --- QUẢN LÝ TRẠNG THÁI ONLINE/OFFLINE CỦA USER ---
const manageUserPresence = (user) => {
    const userStatusDatabaseRef = ref(db, '/status/' + user.uid);
    const userStatusFirestoreRef = ref(db, '/users/' + user.uid); // Giả sử bạn có collection 'users'

    const isOfflineForDatabase = {
        state: 'offline',
        last_changed: serverTimestamp(),
    };

    const isOnlineForDatabase = {
        state: 'online',
        last_changed: serverTimestamp(),
    };

    // Cập nhật trạng thái khi kết nối
    onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase).then(() => {
        set(userStatusDatabaseRef, isOnlineForDatabase);

        // Cập nhật trạng thái trong hồ sơ người dùng (tùy chọn)
        update(userStatusFirestoreRef, {
            last_seen: serverTimestamp(),
            online: true
        });
    });
}

// --- LƯU THÔNG TIN USER VÀO REALTIME DATABASE ---
const saveUserToRealtimeDB = async (user) => {
    const userRef = ref(db, 'users/' + user.uid);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        try {
            await set(userRef, {
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: new Date().toISOString(),
                followers: 0,
                following: 0,
                username: user.email.split('@')[0] // Tạo username mặc định
            });
            console.log("Đã lưu thông tin người dùng mới vào Realtime Database.");
        } catch (error) {
            console.error("Lỗi khi lưu người dùng vào Realtime Database:", error);
        }
    }
};

// --- CẬP NHẬT GIAO DIỆN NGƯỜI DÙNG (UI) ---
const setupUI = (user) => {
    const userMenu = document.getElementById('user-menu');
    if (!userMenu) return; // Thoát nếu không tìm thấy element

    if (user) {
        // Người dùng đã đăng nhập -> Hiển thị menu người dùng
        saveUserToRealtimeDB(user); // Lưu thông tin vào DB
        manageUserPresence(user); // Bắt đầu quản lý trạng thái online

        userMenu.innerHTML = `
            <img src="${user.photoURL}" alt="${user.displayName}" id="user-avatar" class="user-avatar">
            <div class="user-dropdown" id="user-dropdown">
                <a href="/profile.html?uid=${user.uid}">Hồ sơ của bạn</a>
                <button id="logout-btn">Đăng xuất</button>
            </div>
        `;

        const userAvatar = document.getElementById('user-avatar');
        const userDropdown = document.getElementById('user-dropdown');
        const logoutBtn = document.getElementById('logout-btn');

        // Bật/tắt menu dropdown khi click vào avatar
        userAvatar.addEventListener('click', (e) => {
            e.stopPropagation(); // Ngăn sự kiện click lan ra ngoài
            userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
        });

        // Xử lý đăng xuất
        logoutBtn.addEventListener('click', () => {
            signOut(auth).then(() => {
                console.log('Người dùng đã đăng xuất');
                window.location.reload();
            }).catch((error) => {
                console.error('Lỗi đăng xuất', error);
            });
        });

    } else {
        // Người dùng chưa đăng nhập -> Hiển thị nút đăng nhập
        userMenu.innerHTML = `
            <a href="/login.html" class="nav-button">Đăng Nhập</a>
        `;
    }
};

// --- THEO DÕI TRẠNG THÁI ĐĂNG NHẬP ---
onAuthStateChanged(auth, (user) => {
    // Chờ DOM load xong hoàn toàn rồi mới cập nhật UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setupUI(user));
    } else {
        setupUI(user);
    }
});

// Đóng dropdown khi click ra ngoài
window.addEventListener('click', (event) => {
    const userDropdown = document.getElementById('user-dropdown');
    if (userDropdown && userDropdown.style.display === 'block') {
        const userMenu = document.getElementById('user-menu');
        if (!userMenu.contains(event.target)) {
            userDropdown.style.display = 'none';
        }
    }
});

// --- XỬ LÝ ĐĂNG NHẬP (Dành cho trang login.html) ---
const handleLogin = (provider) => {
    signInWithPopup(auth, provider)
        .then(async (result) => {
            await saveUserToRealtimeDB(result.user);
            window.location.href = '/'; // Chuyển về trang chủ sau khi đăng nhập
        })
        .catch((error) => {
            console.error("Lỗi đăng nhập:", error.message);
            alert(`Lỗi: ${error.message}`);
        });
};

// Gán sự kiện cho các nút đăng nhập trên trang login
if (window.location.pathname.includes('login.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', () => handleLogin(provider));
        }
    });
}

// Xuất các hàm và biến cần thiết
export { auth, db, signInWithPopup, provider, saveUserToRealtimeDB };