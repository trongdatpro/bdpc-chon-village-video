Quy trình tổng thể — Chồn Village Web
GIAI ĐOẠN 1: Khách vào trang chủ (index.html)
Khách thấy: Form chọn ngày + số người
Hệ thống làm:
Load dữ liệu giá + lịch từ Google Sheets qua JSONP
Load chính sách đặt phòng (min nights, lead time) theo tháng
Khách nhập:
Ngày nhận / trả phòng
Số người lớn + số trẻ em + độ tuổi trẻ em
Bấm "Tìm phòng"
Dữ liệu lưu vào sessionStorage: chonVillageBooking
GIAI ĐOẠN 2: Trang chọn phòng (rooms.html)
Hệ thống đọc sessionStorage → kiểm tra tất cả 6 phòng → phân loại từng trường hợp:
TRƯỜNG HỢP A — Ngày còn trống, đủ phòng
Hiển thị: Các phòng trống, giá từng đêm chi tiết (ngày thường / cuối tuần / lễ)
Khách bấm "Chọn Phòng" → phòng xuất hiện trong thanh phòng chờ dưới màn hình
Chính sách tự động kiểm tra:
Tình huốngHệ thống làmĐặt 1 đêm, không phải tháng hiện tạiChặn, hiện cảnh báo "ưu tiên từ 2 đêm"Đặt 1 đêm, đúng tháng hiện tại trong lead timeCho phépĐặt 1 đêm, kẹt giữa 2 booking (sandwich)Cho phép đặc biệtTrẻ dưới 6 tuổi, phòng không phải Green RoomChặn, gợi ý Green RoomTrẻ dưới 6 tuổi + 2 người lớn → Green RoomCho phép, ưu tiênTRƯỜNG HỢP B — 5 người lớn + 1 trẻ dưới 6 tuổi (ví dụ cụ thể)
Hệ thống tính:
5 người lớn + 1 trẻ → cần ít nhất 3 phòng (tối đa 3 người/phòng)
Trẻ dưới 6 tuổi → Green Room được ưu tiên hiển thị trước
Hiển thị: 3+ phòng trống (bao gồm Green Room)
Khách chọn phòng đầu (ví dụ Green Room cho trẻ):
Modal mở ra → khách chọn ngày + số người cho phòng này
Hệ thống kiểm tra: trẻ dưới 6 + người lớn ≤ 2 → phải là Green Room ✓
Khách chọn phòng 2, 3:
Modal mở → ngày phải nằm trong range phòng đầu đã chọn
Nếu chọn ngày ra ngoài range → cảnh báo "liên hệ Zalo"
Phụ thu người thứ 3:
5 người lớn, 3 phòng → extraPeople = 5 - (2×3) = -1 → 0 → không phụ thu
5 người lớn, 2 phòng → extraPeople = 5 - (2×2) = 1 → phụ thu 1 người
TRƯỜNG HỢP C — Ngày đã hết phòng
Hệ thống làm:
Tìm ngày trống gần nhất trong vòng ±4 ngày cho từng phòng
Hiển thị card phòng với nút "Xem ngày trống của phòng này"
Khách bấm nút:
Modal mở → hiện lịch riêng của phòng đó
Ngày đã booked: tô màu tối, không chọn được
Ngày trống: sáng, chọn được
Khách chọn ngày mới → bấm XÁC NHẬN ĐỔI:
Validate lại toàn bộ chính sách
Nếu hợp lệ → modal thu nhỏ + animation bay xuống thanh phòng chờ
Các phòng khác vẫn dùng được bình thường
TRƯỜNG HỢP D — Không đủ phòng cho số khách
Hệ thống hiển thị:
Cảnh báo "chỉ còn X phòng, tối đa Y khách"
Nút liên hệ Zalo trực tiếp
TRƯỜNG HỢP E — Chọn nhiều phòng (ghép phòng)
Luồng:
Chọn phòng 1 (ngày A→C, full trip)
Chọn phòng 2 → modal → ngày phải nằm trong A→C
Có thể chọn ngày con (A→B) để ghép phòng
Stitching validation:
Phòng 2 chọn 1 đêm trong range → kiểm tra sandwich (phòng 1 đã book trước/sau)
Nếu không hợp lệ → cảnh báo "liên hệ Zalo"
GIAI ĐOẠN 3: Checkout (checkout.html)
Khách bấm "XÁC NHẬN ĐẶT" → chuyển sang checkout
Hệ thống tính lại tiền:

Tiền phòng = Σ(giá từng đêm × số đêm)
Extra people = numAdults - (2 × numRooms)
Phụ thu = extraPeople × (max_rate + min_rate)/2 × số đêm
Tổng = tiền phòng + phụ thu
Cọc = Tổng / 2
Còn lại = Tổng / 2
Khách tích đồng ý điều khoản:
Hệ thống tự động tạo link PayOS
Hiện QR code + thông tin chuyển khoản
Bắt đầu polling mỗi 2 giây
Khách có thể:
Quét QR
Bấm "Chuyển khoản qua App" → chọn ngân hàng → deep link mở thẳng app ngân hàng
GIAI ĐOẠN 4: Sau thanh toán
(Xem chi tiết phần trước — đã mô tả đầy đủ)
Tóm tắt nhanh:

PayOS xác nhận PAID
    → Form nhập tên + SĐT hiện ra
    → Khách điền + bấm xác nhận
    → Bill tạo ra + hiển thị cho khách
    → Tự động sync 3 lịch (Dữ Liệu + Nội Bộ + Sale)
    → Admin không cần làm gì
GIAI ĐOẠN 5: Admin quản lý (song song)
Admin muốnAdmin làmXem lịch đặt phòngMở Lịch Nội Bộ / Lịch SaleChat tư vấn kháchChú Chồn AI trả lời trên webTạo bill cho booking ngoài hệ thốngGõ vào admin chat: "bill black nhận 15/4 trả 17/4 2 khách tên anh A"Xóa booking nhầmGõ "xóa bill này" + paste billDời lịchGõ "dời bill này sang 20/4 phòng Pink" + paste billTóm tắt toàn bộ công cụ tham gia

index.html      → Chọn ngày/người
rooms.html      → Hiển thị phòng, validate chính sách
rooms.js        → Logic lịch, giá, chính sách, phụ thu, animation
checkout.html   → Tổng hợp giá, PayOS QR
checkout.js     → Tính tiền, polling, tạo bill, sync lịch
server.js       → API backend (PayOS, Claude, GAS bridge)
bookingAgent.js → Đọc bill, sync/xóa/dời 3 lịch
billGenerator.js→ Tạo bill từ lệnh admin
admin.html      → Chat admin + copy bill
3 GAS scripts   → Ghi trực tiếp vào Google Sheets