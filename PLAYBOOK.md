# PLAYBOOK — Cập nhật Policy AirTalk (Siêu ngắn)

> Ai cũng tự làm được. Không cần biết kỹ thuật.

---

## Quy trình 3 thao tác

```
① Dán link tài liệu mới vào chat
        ↓
② Claude xuất TSV 3 khối (ADD ON / REPLACE / NEED-CHECK)
        ↓
③ Người duyệt kiểm tra → paste vào sheet policies
```

---

## ① Mở chat mới — dán câu lệnh mồi này

> **Copy đoạn dưới, dán vào Claude Code, thay phần trong [ ]:**

```
Đọc sheet `policies` từ workbook AirTalk
(ID: 1B2YdmHijBwJJVnsmyiwYQTqrcJHqE0J3Pxz-XVu3lbE).

Tài liệu mới cần xử lý:
[DÁN LINK GOOGLE DOC / SHEET — HOẶC DÁN THẲNG NỘI DUNG VÀO ĐÂY]

Cấu trúc thành bản ghi 18 cột, đối chiếu với policies,
xuất TSV 3 khối: ADD ON / REPLACE / NEED-CHECK kèm ghi chú lý do.
Quy ước: code dùng dấu "-", status mới = needs-review, flagged để trống.
```

**Lưu ý:** Nếu Claude báo không đọc được Drive → paste nội dung sheet policies vào thẳng chat (xem mục "Khi Drive không đọc được" bên dưới).

---

## ② Nhận TSV — Claude tự làm, bạn chờ

Claude sẽ:
1. Đọc sheet `policies` hiện tại (qua Google Drive)
2. Đọc tài liệu mới bạn cung cấp
3. So sánh và xuất 3 khối:

| Khối | Nghĩa |
|------|-------|
| `ADD ON` | Chính sách mới, chưa có trong sheet |
| `REPLACE` | Code đã có, nội dung được cập nhật — giữ nguyên code cũ |
| `NEED-CHECK` | Mâu thuẫn hoặc thiếu thông tin, cần người duyệt xem lại |

---

## ③ Paste vào Google Sheet — quy tắc an toàn

**Trước khi paste:**
- [ ] Đọc cột `# GHI CHÚ` của mỗi record
- [ ] Record `NEED-CHECK` → **không paste**, giữ lại để hỏi thêm
- [ ] Record `REPLACE` → xóa dòng cũ khỏi sheet TRƯỚC khi paste bản mới

**Paste:**
1. Mở Google Sheet → tab `policies`
2. Copy khối TSV (`ADD ON` và `REPLACE` đã kiểm tra)
3. Click ô trống cuối cùng → Paste (Ctrl+Shift+V để paste as plain text)
4. Kiểm tra cột `status` = `needs-review` với mọi record vừa thêm

**Sau khi paste:**
- Đổi `status` → `verified` sau khi đã review kỹ
- Ghi chú vào cột `flagged` nếu cần theo dõi thêm

---

## An toàn

| Nguyên tắc | Lý do |
|------------|-------|
| Status mới luôn = `needs-review` | Chặn record chưa duyệt xuất hiện trên app |
| Trùng code → REPLACE, giữ code cũ | App dùng code làm ID — đổi code sẽ mất link |
| NEED-CHECK không bao giờ paste thẳng | Cần xác nhận thêm trước |
| Xóa dòng cũ trước khi paste REPLACE | Tránh duplicate trong sheet |

---

## Nơi lưu file

| File | Nơi lưu | Mục đích |
|------|---------|----------|
| `PLAYBOOK.md` | Drive → folder **Air-talk** (bản gốc để sửa) | Người dùng đọc |
| `EXAMPLES.md` | Drive → folder **Air-talk** | Tham khảo khi không chắc |
| `.claude/commands/air-talk.md` | Repo GitHub `air-talk` | Claude đọc khi dùng skill `/air-talk` |

> **Quan trọng:** Khi sửa câu lệnh mồi hoặc quy ước, cập nhật CẢ HAI: file trong Drive và file trong repo. Hai bản phải đồng bộ.

---

## Khi Drive không đọc được

Nếu Claude báo lỗi khi đọc Google Sheet:

1. Mở sheet `policies` trên Google Sheets
2. **File → Download → Tab-separated values (.tsv)**
3. Mở file .tsv → copy toàn bộ nội dung
4. Dán vào đầu câu lệnh mồi, trước phần tài liệu mới:

```
Đây là nội dung sheet policies hiện tại:
[PASTE NỘI DUNG TSV VÀO ĐÂY]

Tài liệu mới:
[PASTE TÀI LIỆU MỚI]
...
```

---

## Câu hỏi thường gặp

**Q: Claude bịa ra code không có trong tài liệu?**
A: Kiểm tra khối `NEED-CHECK` — Claude sẽ đưa record không chắc vào đó thay vì tự thêm vào `ADD ON`.

**Q: Một tài liệu có nhiều chủ đề, xử lý hết một lần được không?**
A: Được. Claude xử lý toàn bộ, xuất tất cả record trong 3 khối cùng lúc.

**Q: Flow node (guided process) thì paste vào đâu?**
A: Cùng sheet `policies`, dán bên dưới các policy thường. App sẽ tự nhận diện qua cột `node_id`.
