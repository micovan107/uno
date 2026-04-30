import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, push, set, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db } from './config-firebase.js';
import { sendEmail } from './send-notification.js';

// --- CẤU HÌNH CLOUDINARY ---
// !!! THAY THẾ CÁC GIÁ TRỊ NÀY BẰNG THÔNG TIN CỦA BẠN !!!
const CLOUDINARY_CLOUD_NAME = "dw8rpacnn";
const CLOUDINARY_UPLOAD_PRESET = "nguyentiennam";
// --------------------------

const form = document.getElementById('create-post-form');
const groupSelect = document.getElementById('post-group');
const imageInput = document.getElementById('post-image');
const imagePreview = document.getElementById('image-preview');
const submitButton = form.querySelector('button[type="submit"]');

// Khởi tạo EasyMDE
const easyMDE = new EasyMDE({
    element: document.getElementById('post-content'),
    spellChecker: false,
    placeholder: "Rắc muối ở đây nè...",
    toolbar: ["bold", "italic", "heading", "|", "quote", "code", "unordered-list", "ordered-list", "|", "link", "image", "|", "preview", "side-by-side", "fullscreen", "|", "guide"],
});

// Hàm upload ảnh lên Cloudinary
const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (data.secure_url) {
            return data.secure_url;
        } else {
            throw new Error('Không thể upload ảnh lên Cloudinary.');
        }
    } catch (error) {
        console.error("Lỗi Cloudinary:", error);
        throw error;
    }
};

// Hiển thị ảnh xem trước
imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.innerHTML = `<img src="${e.target.result}" alt="Image Preview"/>`;
        };
        reader.readAsDataURL(file);
    } else {
        imagePreview.innerHTML = '';
    }
});


// Tải danh sách nhóm vào dropdown
const loadGroups = async () => {
    try {
        const groupsRef = ref(db, 'groups');
        const snapshot = await get(groupsRef);
        if (snapshot.exists()) {
            groupSelect.innerHTML = '<option value="">-- Chọn nhóm --</option>';
            snapshot.forEach(childSnapshot => {
                const group = childSnapshot.val();
                const option = document.createElement('option');
                option.value = childSnapshot.key;
                option.textContent = group.displayName; // Sửa lại để hiển thị tên đúng
                groupSelect.appendChild(option);
            });
        } else {
            groupSelect.innerHTML = '<option value="">-- Không tìm thấy nhóm nào --</option>';
        }
    } catch (error) {
        console.error("Lỗi tải danh sách nhóm:", error);
        groupSelect.innerHTML = '<option value="">-- Lỗi tải nhóm --</option>';
    }
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        alert("Bạn cần đăng nhập để đăng bài!");
        window.location.href = 'login.html';
        return;
    }

    // Vô hiệu hóa nút submit để tránh spam
    submitButton.disabled = true;
    submitButton.textContent = 'Đang đăng...';

    const title = form['post-title'].value;
    const groupId = form['post-group'].value;
    const groupDisplayName = groupSelect.options[groupSelect.selectedIndex].text;
    const tag = form['post-tag'].value; // Lấy giá trị nhãn
    const content = easyMDE.value(); // Lấy nội dung từ EasyMDE
    const videoUrl = form['post-video-url'].value;
    const imageFile = imageInput.files[0];

    // Kiểm tra dữ liệu đầu vào
    if (!title || !groupId || !tag) { // Thêm kiểm tra cho nhãn
        alert("Tiêu đề, nhóm và nhãn là bắt buộc.");
        submitButton.disabled = false;
        submitButton.textContent = 'Đăng Bài';
        return;
    }
    if (!content && !videoUrl && !imageFile) {
        alert("Bài đăng phải có ít nhất nội dung, video hoặc hình ảnh.");
        submitButton.disabled = false;
        submitButton.textContent = 'Đăng Bài';
        return;
    }

    try {
        let imageUrl = null;
        // Nếu có ảnh, upload lên Cloudinary trước
        if (imageFile) {
            if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UPLOAD_PRESET") {
                 alert("Lỗi cấu hình: Vui lòng cập nhật Cloud Name và Upload Preset trong file js/create-post.js");
                 throw new Error("Chưa cấu hình Cloudinary.");
            }
            imageUrl = await uploadToCloudinary(imageFile);
        }

        const postsRef = ref(db, 'posts');
        const newPostRef = push(postsRef);

        const postData = {
            title: title,
            groupId: groupId, // Sửa 'group' thành 'groupId'
            groupDisplayName: groupDisplayName,
            tag: tag, // Thêm nhãn vào dữ liệu
            content: content || null,
            videoUrl: videoUrl || null,
            imageUrl: imageUrl,
            authorId: user.uid,
            authorName: user.displayName,
            authorAvatar: user.photoURL,
            createdAt: serverTimestamp(),
            likes: 0,
            commentCount: 0,
        };

        await set(newPostRef, postData);

        // Gửi thông báo cho các thành viên trong nhóm
        notifyGroupMembers(groupId, newPostRef.key, title, user);

        alert("Đăng bài thành công!");
        window.location.href = `group.html?id=${groupId}`;

    } catch (error) {
        console.error("Lỗi khi đăng bài: ", error);
        alert("Đã có lỗi xảy ra khi đăng bài, vui lòng thử lại.");
        // Kích hoạt lại nút submit nếu có lỗi
        submitButton.disabled = false;
        submitButton.textContent = 'Đăng Bài';
    }
});

// Chạy các hàm cần thiết khi trang được tải
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadGroups();
    } else {
        // Nếu người dùng chưa đăng nhập, có thể hiển thị thông báo hoặc ẩn form
        console.log("Người dùng chưa đăng nhập.");
    }
});

// --- HÀM GỬI THÔNG BÁO CHO THÀNH VIÊN NHÓM ---
const notifyGroupMembers = async (groupId, newPostId, postTitle, author) => {
    try {
        // 1. Lấy danh sách thành viên của nhóm
        const membersRef = ref(db, `groups/${groupId}/members`);
        const membersSnapshot = await get(membersRef);
        if (!membersSnapshot.exists()) return;

        const members = membersSnapshot.val();
        const memberIds = Object.keys(members);

        // 2. Lặp qua từng thành viên để kiểm tra và gửi email
        for (const memberId of memberIds) {
            // Không gửi thông báo cho chính người đăng bài
            if (memberId === author.uid) continue;

            const userRef = ref(db, `users/${memberId}`);
            const statusRef = ref(db, `status/${memberId}`);

            const [userSnapshot, statusSnapshot] = await Promise.all([
                get(userRef),
                get(statusRef)
            ]);

            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                const userStatus = statusSnapshot.val();

                // 3. Nếu user offline và có email, gửi thông báo
                if (userStatus && userStatus.state === 'offline' && userData.email) {
                    const postUrl = `${window.location.origin}/post.html?id=${newPostId}`;
                    const subject = `Bài đăng mới trong nhóm ${members.groupDisplayName || ''}`;
                    const htmlContent = `
                        <p>Chào ${userData.displayName},</p>
                        <p><b>${author.displayName}</b> vừa đăng một bài viết mới có tiêu đề "<b>${postTitle}</b>" trong nhóm mà bạn tham gia.</p>
                        <p>Xem bài đăng ngay tại đây: <a href="${postUrl}">${postUrl}</a></p>
                        <p>Trân trọng,<br>Đội ngũ Vex</p>
                    `;
                    // Gửi email mà không cần chờ (để tránh làm chậm vòng lặp)
                    sendEmail(userData.email, userData.displayName, subject, htmlContent);
                }
            }
        }
    } catch (error) {
        console.error("Lỗi khi gửi thông báo cho thành viên nhóm:", error);
    }
};