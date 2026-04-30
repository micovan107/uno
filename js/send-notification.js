// Tệp này chứa hàm để gửi email thông báo qua Brevo API

const BREVO_API_KEY = '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'; // !!! THAY THẾ BẰNG API KEY CỦA BẠN !!!
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Gửi email thông báo sử dụng Brevo.
 * @param {string} toEmail - Email của người nhận.
 * @param {string} toName - Tên của người nhận.
 * @param {string} subject - Chủ đề của email.
 * @param {string} htmlContent - Nội dung HTML của email.
 * @returns {Promise<boolean>} - Trả về true nếu gửi thành công, ngược lại false.
 */
export const sendEmail = async (toEmail, toName, subject, htmlContent) => {

    const sender = {
        name: 'Vex', // Tên người gửi
        email: 'micovanxxx@gmail.com' // Email người gửi (cần được xác thực trên Brevo)
    };

    const payload = {
        sender,
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent
    };

    try {
        const response = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log(`Email thông báo đã được gửi thành công đến ${toEmail}`);
            return true;
        } else {
            const errorData = await response.json();
            console.error(`Lỗi khi gửi email đến ${toEmail}:`, errorData.message || 'Lỗi không xác định');
            return false;
        }
    } catch (error) {
        console.error('Lỗi mạng hoặc lỗi khi gọi Brevo API:', error);
        return false;
    }
};