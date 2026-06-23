# EXAMPLES.md — Ví dụ thật từ workbook AirTalk

> Dữ liệu lấy từ `policies` sheet:
> `1B2YdmHijBwJJVnsmyiwYQTqrcJHqE0J3Pxz-XVu3lbE`

---

## Ví dụ 1 — ADD ON

### (a) Đầu vào thô
Nguồn: Sheet **Documentary** (workbook trên), tình huống:
> "Customer bought eSIM, wants to move it to new phone"

Không tìm thấy code nào trong `policies` liên quan đến *chuyển eSIM sang device mới*
(code gần nhất: `esim_blacklisted_device` — khác tình huống).

### (b) Lý do phân loại → ADD ON
Code `esim-transfer` chưa tồn tại. Tình huống đủ phổ biến để thành record riêng
(khác với blacklisted device, khác với eSIM activation thông thường).

### (c) Record kết quả 18 cột

| Cột | Giá trị |
|-----|---------|
| code | `esim-transfer` |
| category | `Service` |
| keyword | `eSIM Transfer to New Device` |
| tags | `esim transfer, move esim, new phone, device upgrade, esim reinstall, chuyển eSIM sang điện thoại mới, QR code mới` |
| summary_main | `Khách muốn chuyển eSIM đang active sang device mới. eSIM profile có thể transfer nếu carrier hỗ trợ và device mới eSIM-capable. Một số trường hợp cần cấp QR code mới; eSIM trên device cũ sẽ bị deactivate.` |
| when_to_use | `Khi khách hỏi cách dùng eSIM đã mua trên điện thoại mới / upgrade device.` |
| check | `eSIM status (active/installed/deactivated); device cũ vs mới; device mới có eSIM-capable và unlocked không; ICCID; carrier support for transfer; cần QR mới không.` |
| script_en | `I'll check your eSIM status. If the profile is still active and your new device supports eSIM, we can arrange a transfer. Please note this may require a new QR code, and the eSIM on your current device will be deactivated once the transfer is complete.` |
| source_file | `Documentary` |
| source_link | `https://docs.google.com/spreadsheets/d/1B2YdmHijBwJJVnsmyiwYQTqrcJHqE0J3Pxz-XVu3lbE/edit?gid=1324182463` |
| status | `needs-review` |
| last_updated | `2026-06-23` |
| hot | `FALSE` |
| tree_code | *(trống)* |
| node_id | *(trống)* |
| node_type | *(trống)* |
| options | *(trống)* |
| flagged | *(trống)* |

### (d) Ghi chú
Code dùng dash `-`: `esim-transfer` (nhất quán với `refund-complete`, `refund-timeframe`).
Status `needs-review` — chờ người duyệt xác nhận trước khi paste vào sheet.

---

## Ví dụ 2 — REPLACE

### (a) Đầu vào thô
Sheet `policies` có **2 dòng cùng code `port_out`**:

**Bản cũ** (line 576):
- `source_file`: `Port in`
- `last_updated`: `2025-03-27`
- `summary_main`: *"Khách chuyển số AirTalk sang nhà mạng khác. CSR hỏi lý do, retain, nhắc port-out = terminate service, verify bảo mật, gửi account/PIN qua OTP, inform process/cancellation."*
- `check`: `Port-out reason; MDN muốn port; OCS Live Status; previous port-in pending không; ...`

**Bản mới** (line 681):
- `source_file`: `Documentary`
- `last_updated`: `2026-06-18`
- `summary_main`: *"Port-out là khách chuyển số AirTalk sang carrier khác và có thể dẫn tới cancel service. CSR phải verify account, hỏi lý do/retain, disclose risks, verify email/ICCID, gửi account/PIN, nhắc PIN valid 4 ngày và port-out thường khoảng 24h sau khi new provider submit."*
- `check`: *"Account holder; MDN muốn port; OCS Live Status Active; previous failed/pending port-in; lý do + retention; customer acknowledged risks; nhận PIN qua MDN/email; verify ICCID/email/ID proof nếu cần; cancellation/new SIM decision; activity note."*

### (b) Lý do phân loại → REPLACE
Code trùng. Bản 2026-06-18 chi tiết hơn (thêm PIN valid 4 ngày, "24h", ID proof, activity note).
Giữ nguyên code `port_out`, thay nội dung bằng bản mới.

### (c) Record kết quả 18 cột (bản thắng = 2026-06-18)

| Cột | Giá trị |
|-----|---------|
| code | `port_out` ← **GIỮ NGUYÊN** |
| category | `Port` |
| keyword | `Port Out` |
| tags | `port out; transfer PIN; account number; leave AirTalk; cancel service; retention; OTP; port-out risk` |
| summary_main | `Port-out là khách chuyển số AirTalk sang carrier khác và có thể dẫn tới cancel service. CSR phải verify account, hỏi lý do/retain, disclose risks, verify email/ICCID, gửi account/PIN, nhắc PIN valid 4 ngày và port-out thường khoảng 24h sau khi new provider submit.` |
| when_to_use | `Khi khách yêu cầu account number/PIN, muốn port out, hoặc hỏi cách chuyển số AirTalk sang carrier khác.` |
| check | `Account holder; MDN muốn port; OCS Live Status Active; previous failed/pending port-in; lý do + retention; customer acknowledged risks; nhận PIN qua MDN/email; verify ICCID/email/ID proof nếu cần; cancellation/new SIM decision; activity note.` |
| script_en | `I'm sorry to hear you're considering leaving us. May I ask the reason first so I can check if there is anything we can do to help? Please note that porting out is considered a request to terminate the service associated with that number. The transfer PIN is valid for 4 days, and your current SIM will be deactivated once the port-out is completed.` |
| source_file | `Documentary` |
| source_link | `https://docs.google.com/spreadsheets/d/1B2YdmHijBwJJVnsmyiwYQTqrcJHqE0J3Pxz-XVu3lbE/edit?gid=1324182463` |
| status | `needs-review` |
| last_updated | `2026-06-18` |
| hot | `TRUE` |
| tree_code | *(trống)* |
| node_id | *(trống)* |
| node_type | *(trống)* |
| options | *(trống)* |
| flagged | *(trống)* |

### (d) Ghi chú
Bản cũ (2025-03-27, source: "Port in") bị REPLACE. Không đổi code.
Người duyệt cần xóa dòng cũ thủ công khỏi sheet sau khi paste bản mới.

---

## Ví dụ 3 — GUIDED FLOW (node records)

### (a) Đầu vào thô
Tài liệu: "Process Port-out cho CSR" → các bước xử lý khi khách yêu cầu port-out.

### (b) Lý do phân loại
Là quy trình có nhánh (step/question/leaf) → tạo nhiều node records thay vì 1 policy record.
Các code dạng `{tree-code}_{nodeId}`, `node_type` bắt buộc, `options` điều hướng.

### (c) Records kết quả (trích 3 node đầu, đủ hiểu pattern)

**Node 1 — Bước xác minh tài khoản**

| Cột | Giá trị |
|-----|---------|
| code | `port-out-flow_n1` |
| category | `Port` |
| keyword | `Port Out Flow` |
| tags | `port out flow, guided process, CSR step` |
| summary_main | `Verify account holder trước khi hỗ trợ. Check MDN khách muốn port out.` |
| check | `CRM verify account holder + MDN` |
| script_en | *(trống)* |
| source_file | `Documentary` |
| status | `verified` |
| last_updated | `2026-06-18` |
| hot | `FALSE` |
| tree_code | `port-out-flow` |
| node_id | `n1` |
| node_type | `step` |
| options | `Tiếp tục>n2` |
| flagged | *(trống)* |

**Node 2 — Câu hỏi phân nhánh: OCS Status**

| Cột | Giá trị |
|-----|---------|
| code | `port-out-flow_n2` |
| node_id | `n2` |
| node_type | `question` |
| summary_main | `Check OCS Live Status — trạng thái MDN?` |
| options | `Active>n3` |
| flagged | `Không Active>L_inactive` |

> *`flagged` dùng để chứa nhánh "unhappy path" — đây là quy ước riêng của AirTalk.*

**Node 3 — Leaf: MDN không Active**

| Cột | Giá trị |
|-----|---------|
| code | `port-out-flow_L_inactive` |
| node_id | `L_inactive` |
| node_type | `leaf` |
| summary_main | `MDN không Active — cần xác minh thêm.` |
| check | `Escalate theo SOP; confirm với supervisor trước khi tiếp tục` |
| options | *(trống — leaf không có nhánh tiếp)* |

### (d) Ghi chú
- `tree_code` = tên flow, dùng dấu `-`: `port-out-flow`
- `node_id` prefix `L_` = leaf (điểm kết), `n` = bước trung gian
- `options` format: `Nhãn>node_id` (nhiều nhánh dùng `;` phân cách trong cùng ô hoặc tách sang `flagged`)
- Flow nodes không cần `flagged` bình thường — `flagged` đang được tái dụng để chứa "unhappy path option"

---

## Quy ước code — tóm tắt

| Loại | Separator | Ví dụ thật |
|------|-----------|------------|
| Policy thường | `-` (dash) | `refund-complete`, `esim-transfer` |
| Policy cũ (giữ nguyên) | `_` (underscore) | `port_out`, `esim_blacklisted_device` |
| Flow node | `{tree-code}_{nodeId}` | `port-out-flow_n1`, `port-out-flow_L_inactive` |

**Đề xuất**: Mọi code MỚI dùng `-`. Không đổi code cũ đang tồn tại.
