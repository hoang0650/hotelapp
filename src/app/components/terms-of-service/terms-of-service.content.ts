export type LegalBlock = {
  h3?: string;
  h4?: string;
  p?: string[];
  ul?: string[];
  strongP?: string;
};

export type LegalSection = {
  title: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  title: string;
  lastUpdatedLabel: string;
  subtitle?: string;
  sections: LegalSection[];
};

/** Thoả thuận sử dụng phần mềm PHHotel — cấu trúc tham chiếu SaaS (định nghĩa, phí, tạm dừng/huỷ, IP, bảo mật, PDPA). */
export const TERMS_DOCS: Record<'vi' | 'en', LegalDoc> = {
  vi: {
    title: 'Thoả thuận sử dụng Dịch vụ Phần mềm PHHotel',
    lastUpdatedLabel: 'Cập nhật lần cuối',
    subtitle:
      'Giữa Khách hàng và Công ty TNHH Giải Pháp Công Nghệ PHGROUP (“PHHotel”). Áp dụng cho PHHotel PMS trên web, ứng dụng di động và App Clip.',
    sections: [
      {
        title: '',
        blocks: [
          {
            p: [
              'Đây là thỏa thuận pháp lý giữa Khách hàng với Công ty TNHH Giải Pháp Công Nghệ PHGROUP (“PHHotel”), quy định điều khoản khi Khách hàng sử dụng phần mềm và dịch vụ PHHotel (“Thỏa thuận”).',
              'Thỏa thuận này là Hợp đồng dịch vụ dưới hình thức giao dịch điện tử. Bằng việc đăng ký tài khoản, tích chọn đồng ý, thanh toán hoặc tiếp tục sử dụng Dịch vụ, Khách hàng xác nhận đã đọc, hiểu và chấp thuận toàn bộ điều khoản.',
              'Website chính: https://phhotel.vn — Hỗ trợ: support@phhotel.vn',
            ],
          },
        ],
      },
      {
        title: 'Điều 1: Định nghĩa',
        blocks: [
          {
            p: [
              '1.1 Phần mềm PHHotel: Hệ thống quản lý khách sạn (PMS) và các module liên quan do PHHotel phát triển/cung cấp, bao gồm phiên bản web, ứng dụng di động iOS/Android, App Clip và các tính năng hỗ trợ vận hành trong sản phẩm (ví dụ chatbox AI trong PMS), được mô tả tại https://phhotel.vn và tài liệu sản phẩm từng thời kỳ.',
              '1.2 Dịch vụ: Quyền truy cập và sử dụng Phần mềm trong thời hạn đã đăng ký/thanh toán (theo tháng, năm hoặc gói khác công bố trên website/ứng dụng).',
              '1.3 Khách hàng: Cá nhân hoặc tổ chức đăng ký/sử dụng Dịch vụ và đồng ý Thỏa thuận này (cơ sở lưu trú, chuỗi khách sạn, đơn vị vận hành…).',
              '1.4 Tài khoản quản trị: Tài khoản có quyền cao nhất trên hệ thống của Khách hàng (cấu hình cơ sở, người dùng, phân quyền, thanh toán…).',
              '1.5 Người dùng: Nhân viên hoặc bên được Khách hàng cấp quyền truy cập Dịch vụ.',
              '1.6 Kích hoạt Dịch vụ: Thời điểm PHHotel bàn giao/cấp quyền truy cập Tài khoản quản trị và Khách hàng có thể đăng nhập sử dụng.',
              '1.7 Tạm dừng / Huỷ Dịch vụ: Tạm hạn chế hoặc chấm dứt quyền truy cập theo Thỏa thuận.',
              '1.8 Phí Dịch vụ: Khoản phí Khách hàng thanh toán để sử dụng/duy trì Dịch vụ theo bảng giá công bố hoặc hợp đồng riêng.',
              '1.9 Đối tác thứ ba: Ngân hàng, cổng thanh toán, e-invoice, SMS, Google, Apple, kho ứng dụng và bên cung cấp tiện ích kết nối với Phần mềm.',
              '1.10 Dữ liệu Khách hàng: Dữ liệu do Khách hàng hoặc Người dùng nhập/tạo trên Phần mềm (phòng, đặt phòng, khách lưu trú, hóa đơn, báo cáo…), bao gồm dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.',
            ],
          },
        ],
      },
      {
        title: 'Điều 2: Dịch vụ và Kích hoạt',
        blocks: [
          {
            p: [
              '2.1 PHHotel cung cấp Dịch vụ quản lý khách sạn trên web và ứng dụng di động, phù hợp pháp luật Việt Nam và mô tả sản phẩm tại website/ứng dụng.',
              '2.2 Khách hàng có quyền sử dụng Phần mềm sau khi hoàn tất đăng ký và (nếu áp dụng) thanh toán phí theo gói đã chọn.',
              '2.3 Sau khi nhận Tài khoản quản trị, Khách hàng phải đổi mật khẩu (nếu được yêu cầu), bật biện pháp bảo mật phù hợp và chịu trách nhiệm bảo mật tài khoản/thiết bị đăng nhập (bao gồm Face ID/sinh trắc học trên thiết bị của Người dùng).',
              '2.4 Khách hàng khai báo thông tin tổ chức/người dùng trung thực, cập nhật khi thay đổi.',
            ],
          },
        ],
      },
      {
        title: 'Điều 3: Phí Dịch vụ',
        blocks: [
          {
            p: [
              '3.1 Phí Kích hoạt (nếu có) và Phí Dịch vụ được công bố tại https://phhotel.vn, trên ứng dụng hoặc theo báo giá/hợp đồng riêng.',
              '3.2 Phí có thể gồm: phí thuê bao Phần mềm; phí vượt hạn mức (phòng, chi nhánh, người dùng, lưu trữ…); phí module bổ sung.',
              '3.3 Phí Dịch vụ không bao gồm phí Đối tác thứ ba (ngân hàng, VietQR/NAPAS, e-invoice, SMS, Apple/Google…).',
              '3.4 PHHotel có thể điều chỉnh bảng giá theo thị trường và công bố trên website/ứng dụng. Gói đã thanh toán trước được giữ mức phí đã thỏa thuận đến hết kỳ đã trả.',
              '3.5 Chính sách hoàn phí (nếu có) áp dụng theo công bố tại thời điểm mua hoặc hợp đồng riêng; ngoài phạm vi đó, phí đã thanh toán không hoàn lại khi Khách hàng chủ động Huỷ giữa kỳ, trừ trường hợp pháp luật bắt buộc.',
            ],
          },
        ],
      },
      {
        title: 'Điều 4: Thanh toán',
        blocks: [
          {
            p: [
              '4.1 Thanh toán bằng chuyển khoản, cổng thanh toán trực tuyến hoặc phương thức khác do PHHotel chấp nhận.',
              '4.2 Phí chu kỳ đầu thanh toán theo hướng dẫn khi đặt hàng/đăng ký. Phí gia hạn thanh toán chậm nhất trong thời hạn ghi trên thông báo (email/ứng dụng), trừ khi có thỏa thuận khác.',
              '4.3 Khách hàng chịu thuế, phí ngân hàng và chi phí phát sinh liên quan đến giao dịch thanh toán (nếu có).',
            ],
          },
        ],
      },
      {
        title: 'Điều 5: Tạm dừng Dịch vụ',
        blocks: [
          {
            p: [
              '5.1 Khách hàng có thể yêu cầu tạm dừng bằng văn bản/email hoặc tính năng hỗ trợ trên Phần mềm.',
              '5.2 PHHotel có quyền tạm dừng khi: (a) theo yêu cầu cơ quan nhà nước; (b) quá hạn thanh toán; (c) vi phạm Thỏa thuận; (d) bảo trì, nâng cấp, khắc phục/phòng ngừa sự cố an ninh hoặc yêu cầu kỹ thuật.',
              '5.3 Trừ trường hợp (a) và (d) hoặc dấu hiệu vi phạm pháp luật nghiêm trọng, PHHotel cố gắng thông báo trước hợp lý qua email/ứng dụng.',
            ],
          },
        ],
      },
      {
        title: 'Điều 6: Huỷ Dịch vụ',
        blocks: [
          {
            p: [
              '6.1 Khách hàng có thể yêu cầu Huỷ Dịch vụ theo quy trình hỗ trợ. Sau Huỷ, quyền truy cập chấm dứt; việc xuất/sao lưu dữ liệu cần thực hiện trước khi Huỷ theo hướng dẫn.',
              '6.2 PHHotel có quyền Huỷ khi: theo lệnh cơ quan nhà nước; quá hạn thanh toán kéo dài; hoặc vi phạm nghiêm trọng/không khắc phục Thỏa thuận.',
              '6.3 Sau Huỷ, PHHotel có thể lưu trữ một phần dữ liệu theo Điều về lưu trữ và pháp luật Việt Nam (kế toán, chống rửa tiền nếu áp dụng, bảo vệ dữ liệu cá nhân).',
            ],
          },
        ],
      },
      {
        title: 'Điều 7: Dùng thử',
        blocks: [
          {
            p: [
              '7.1 PHHotel có thể cấp tài khoản demo/dùng thử theo chính sách từng thời kỳ và có quyền từ chối yêu cầu dùng thử.',
              '7.2 Dữ liệu dùng thử có thể bị xóa khi hết hạn dùng thử mà không báo trước thêm, trừ khi có thỏa thuận khác.',
            ],
          },
        ],
      },
      {
        title: 'Điều 8: Quyền và nghĩa vụ của PHHotel',
        blocks: [
          {
            p: [
              '8.1 Cung cấp Dịch vụ theo mô tả sản phẩm và Thỏa thuận; duy trì hạ tầng hợp lý; hỗ trợ kỹ thuật qua kênh công bố.',
              '8.2 Bảo mật và xử lý Dữ liệu Khách hàng theo chính sách bảo mật tại https://phhotel.vn/privacy-policy và pháp luật hiện hành.',
              '8.3 Được tạm dừng/huỷ theo Điều 5–6; cập nhật Phần mềm; thu phí theo bảng giá đã công bố hoặc hợp đồng.',
            ],
          },
        ],
      },
      {
        title: 'Điều 9: Quyền và nghĩa vụ của Khách hàng',
        blocks: [
          {
            p: [
              '9.1 Quyền: sử dụng tính năng theo gói; xuất dữ liệu trong thời gian còn quyền truy cập; yêu cầu hỗ trợ; yêu cầu tạm dừng/huỷ theo Thỏa thuận.',
              '9.2 Nghĩa vụ: thanh toán đúng hạn; bảo mật tài khoản; sử dụng đúng mục đích quản lý cơ sở lưu trú hợp pháp; không xâm phạm hệ thống; không chia sẻ trái phép quyền truy cập; tuân thủ pháp luật Việt Nam về lưu trú, thuế, hóa đơn, bảo vệ dữ liệu cá nhân của khách lưu trú và nhân viên.',
            ],
            ul: [
              'Không dùng Dịch vụ cho lừa đảo, rửa tiền, cờ bạc trái phép, tín dụng đen, hàng cấm, tài trợ khủng bố hoặc hành vi vi phạm pháp luật khác;',
              'Không phá hoại, quét lỗ hổng, tấn công từ chối dịch vụ hoặc xâm nhập trái phép;',
              'Không sao chép, dịch ngược, tái phân phối Phần mềm trái phép;',
              'Chịu trách nhiệm về dữ liệu khách lưu trú/nhân viên do mình nhập và nghĩa vụ xin chấp thuận xử lý dữ liệu theo Nghị định 13/2023/NĐ-CP khi đóng vai trò bên kiểm soát dữ liệu.',
            ],
          },
        ],
      },
      {
        title: 'Điều 10: Hỗ trợ',
        blocks: [
          {
            p: [
              '10.1 Hỗ trợ qua support@phhotel.vn, kênh trong ứng dụng/website hoặc số điện thoại công bố tại https://phhotel.vn.',
              '10.2 Hỗ trợ tại chỗ, đào tạo chuyên sâu hoặc tùy chỉnh có thể tính phí riêng theo thỏa thuận.',
            ],
          },
        ],
      },
      {
        title: 'Điều 11: Bảo hành, bảo trì',
        blocks: [
          {
            p: [
              '11.1 PHHotel nỗ lực duy trì Dịch vụ 24/7, trừ bảo trì, nâng cấp, sự cố hoặc bất khả kháng. Bảo trì định kỳ ưu tiên ngoài giờ cao điểm và thông báo khi hợp lý.',
              '11.2 Sự cố do lỗi PHHotel được tiếp nhận và xử lý trong thời gian hợp lý sau khi nhận đủ thông tin từ Khách hàng.',
            ],
          },
        ],
      },
      {
        title: 'Điều 12: Sự cố an ninh',
        blocks: [
          {
            p: [
              '12.1 Khách hàng phải báo ngay khi nghi ngờ mất dữ liệu, truy cập trái phép, gián đoạn bất thường hoặc tấn công.',
              '12.2 PHHotel điều tra/khắc phục trong phạm vi kiểm soát; Khách hàng phối hợp cung cấp nhật ký, tài khoản liên quan khi được yêu cầu hợp lý.',
            ],
          },
        ],
      },
      {
        title: 'Điều 13: Giới hạn trách nhiệm',
        blocks: [
          {
            p: [
              '13.1 Dịch vụ cung cấp theo tình trạng “nguyên trạng” và “có sẵn”. PHHotel không bảo đảm không gián đoạn, không lỗi, hoặc đáp ứng mọi yêu cầu đặc thù của Khách hàng.',
              '13.2 Khách hàng tự chịu trách nhiệm về tính đúng đắn của dữ liệu vận hành, hóa đơn, báo cáo thuế và quyết định kinh doanh dựa trên Phần mềm. Nếu bị xử phạt do dữ liệu/thao tác của mình, Khách hàng tự chịu trách nhiệm.',
              '13.3 Trong phạm vi pháp luật cho phép, PHHotel không chịu trách nhiệm thiệt hại gián tiếp, mất doanh thu, mất dữ liệu do Khách hàng không sao lưu, truy cập trái phép do lộ mật khẩu phía Khách hàng, hoặc lỗi Đối tác thứ ba.',
              '13.4 Tổng trách nhiệm bồi thường của PHHotel (nếu có) không vượt quá tổng Phí Dịch vụ Khách hàng đã thanh toán cho PHHotel trong 03 tháng liền kề trước sự kiện, trừ thiệt hại do lỗi cố ý/vi phạm nghiêm trọng mà pháp luật không cho phép giới hạn.',
            ],
          },
        ],
      },
      {
        title: 'Điều 14: Dịch vụ Đối tác thứ ba',
        blocks: [
          {
            p: [
              '14.1 Phần mềm có thể kết nối thanh toán, e-invoice, SMS, đăng nhập Google/Apple, kho ứng dụng… Khách hàng tự quyết định bật/tắt và tuân thủ điều khoản của Đối tác.',
              '14.2 Phí và sự cố thuộc hệ thống Đối tác do Đối tác giải quyết; PHHotel hỗ trợ phần kết nối trên Phần mềm.',
              '14.3 Nếu Phần mềm có tính năng AI hỗ trợ trong PMS, nội dung do AI tạo mang tính tham khảo; Khách hàng kiểm tra trước khi dùng cho quyết định vận hành.',
            ],
          },
        ],
      },
      {
        title: 'Điều 15: Sở hữu trí tuệ',
        blocks: [
          {
            p: [
              '15.1 PHHotel/PHGROUP giữ bản quyền, nhãn hiệu, mã nguồn, giao diện, tài liệu của Phần mềm và hệ sinh thái liên quan.',
              '15.2 Khách hàng được cấp quyền sử dụng không độc quyền, không chuyển nhượng (trừ khi có thỏa thuận viết), trong thời hạn Dịch vụ.',
              '15.3 Dữ liệu vận hành do Khách hàng tạo thuộc quyền kiểm soát của Khách hàng; PHHotel được xử lý để cung cấp Dịch vụ theo Thỏa thuận và chính sách bảo mật.',
            ],
          },
        ],
      },
      {
        title: 'Điều 16: Bảo mật thông tin',
        blocks: [
          {
            p: [
              '16.1 Hai bên bảo mật thông tin kỹ thuật, thương mại và Dữ liệu Khách hàng; không tiết lộ cho bên thứ ba trừ khi được phép, phục vụ cung cấp Dịch vụ, hoặc theo pháp luật.',
              '16.2 Khách hàng chịu trách nhiệm mọi hoạt động từ tài khoản của mình và báo cáo truy cập trái phép ngay khi phát hiện.',
            ],
          },
        ],
      },
      {
        title: 'Điều 17: Thông báo',
        blocks: [
          {
            p: [
              'PHHotel có thể gửi thông báo tính năng mới, bảo trì, thanh toán, chính sách qua ứng dụng, email, SMS hoặc website. Khách hàng duy trì thông tin liên hệ chính xác.',
            ],
          },
        ],
      },
      {
        title: 'Điều 18: Bất khả kháng',
        blocks: [
          {
            p: [
              'Các bên được miễn trách nhiệm thực hiện nghĩa vụ trong thời gian bị cản trở bởi sự kiện ngoài tầm kiểm soát hợp lý (thiên tai, chiến tranh, dịch bệnh, sự cố hạ tầng quốc gia, tấn công mạng quy mô lớn, quyết định cơ quan nhà nước…), với điều kiện đã thông báo và nỗ lực khắc phục hợp lý.',
            ],
          },
        ],
      },
      {
        title: 'Điều 19: Xử lý dữ liệu cá nhân',
        blocks: [
          {
            p: [
              '19.1 Khi cung cấp PMS, PHHotel có thể là bên xử lý dữ liệu theo chỉ định của Khách hàng đối với dữ liệu khách lưu trú/nhân viên mà Khách hàng nhập vào hệ thống; đồng thời có thể là bên kiểm soát đối với dữ liệu tài khoản quản trị, thanh toán dịch vụ, nhật ký kỹ thuật.',
              '19.2 Khách hàng cam kết có cơ sở pháp lý (thông báo/đồng ý hoặc căn cứ khác theo Nghị định 13/2023/NĐ-CP) khi thu thập và đưa dữ liệu cá nhân lên Phần mềm.',
              '19.3 Chi tiết thu thập, mục đích, lưu trữ, quyền chủ thể dữ liệu xem tại Chính sách bảo mật: https://phhotel.vn/privacy-policy và trang xóa tài khoản (nếu áp dụng).',
              '19.4 Dữ liệu có thể được lưu trên hạ tầng do PHHotel chỉ định tại Việt Nam và/hoặc nhà cung cấp đám mây ở nước ngoài khi cần thiết cho vận hành (ví dụ dịch vụ Google), với biện pháp bảo vệ phù hợp.',
            ],
          },
        ],
      },
      {
        title: 'Điều 20: Hiệu lực và chấm dứt',
        blocks: [
          {
            p: [
              'Thỏa thuận có hiệu lực từ khi Khách hàng chấp thuận/sử dụng Dịch vụ và tiếp tục đến khi Huỷ Dịch vụ hoặc thay thế bằng phiên bản mới được công bố. Các điều về sở hữu trí tuệ, bảo mật, giới hạn trách nhiệm, dữ liệu cá nhân vẫn có hiệu lực sau khi chấm dứt trong phạm vi cần thiết.',
            ],
          },
        ],
      },
      {
        title: 'Điều 21: Điều khoản chung',
        blocks: [
          {
            p: [
              '21.1 Luật áp dụng: pháp luật Việt Nam. Tranh chấp ưu tiên thương lượng; không đạt thì Tòa án nhân dân có thẩm quyền tại Việt Nam.',
              '21.2 PHHotel có thể cập nhật Thỏa thuận và công bố trên https://phhotel.vn/terms-of-service và/hoặc trong ứng dụng. Việc tiếp tục sử dụng sau ngày hiệu lực được xem là chấp thuận phiên bản mới, trừ khi Khách hàng Huỷ Dịch vụ.',
              '21.3 Nếu một điều bị vô hiệu, các điều còn lại vẫn hiệu lực.',
              '21.4 Liên hệ: Công ty TNHH Giải Pháp Công Nghệ PHGROUP — support@phhotel.vn — https://phhotel.vn',
            ],
          },
        ],
      },
      {
        title: 'Điều 22: Giám sát và xử lý vi phạm',
        blocks: [
          {
            p: [
              'PHHotel có quyền tạm dừng hoặc Huỷ Dịch vụ, thu hồi quyền truy cập và/hoặc báo cáo cơ quan chức năng khi phát hiện dấu hiệu sử dụng trái pháp luật, xâm phạm hệ thống hoặc vi phạm nghiêm trọng Thỏa thuận.',
            ],
          },
        ],
      },
      {
        title: 'Điều 23: Cam kết của Khách hàng',
        blocks: [
          {
            p: [
              'Khách hàng cam kết thông tin đăng ký đúng; sử dụng Dịch vụ đúng mục đích kinh doanh lưu trú hợp pháp; không chuyển nhượng tài khoản trái phép; và chịu trách nhiệm với Người dùng do mình quản lý.',
            ],
          },
        ],
      },
      {
        title: 'Điều 24: Lưu trữ dữ liệu',
        blocks: [
          {
            p: [
              'Trong thời gian Dịch vụ, dữ liệu được lưu trên hệ thống PHHotel. Sau Huỷ, PHHotel có thể xóa hoặc ẩn danh theo quy trình, trừ phần phải lưu theo pháp luật hoặc giải quyết tranh chấp. Khách hàng tự xuất dữ liệu trước khi Huỷ nếu cần lưu trữ dài hạn.',
            ],
          },
        ],
      },
      {
        title: 'Điều 25: Tính năng AI trong PHHotel PMS',
        blocks: [
          {
            p: [
              '25.1 Một số gói PHHotel PMS có thể gồm tính năng AI hỗ trợ vận hành (ví dụ chatbox trong sản phẩm). Đây là một phần của PHHotel PMS, không phải sàn hoặc dịch vụ marketplace riêng.',
              '25.2 Nội dung do AI tạo mang tính hỗ trợ; Khách hàng kiểm tra trước khi áp dụng vào vận hành, giá, hợp đồng hoặc giao tiếp với khách lưu trú.',
              '25.3 Không nhập dữ liệu bí mật nhà nước hoặc dữ liệu bị cấm chia sẻ vào công cụ AI nếu pháp luật hoặc hợp đồng không cho phép.',
            ],
          },
        ],
      },
    ],
  },
  en: {
    title: 'PHHotel Software Services Agreement',
    lastUpdatedLabel: 'Last updated',
    subtitle:
      'Between the Customer and PHGROUP Technology Solutions Co., Ltd. (“PHHotel”). Applies to PHHotel PMS on web, mobile apps, and App Clip.',
    sections: [
      {
        title: '',
        blocks: [
          {
            p: [
              'This is a legal agreement between the Customer and PHGROUP Technology Solutions Co., Ltd. (“PHHotel”) governing use of PHHotel software and services (the “Agreement”).',
              'By registering, checking consent, paying for, or continuing to use the Service, the Customer agrees to these terms as an electronic service contract.',
              'Website: https://phhotel.vn — Support: support@phhotel.vn',
            ],
          },
        ],
      },
      {
        title: 'Article 1: Definitions',
        blocks: [
          {
            p: [
              '1.1 PHHotel Software: The hotel property management system (PMS) and related modules provided by PHHotel, including web, iOS/Android apps, App Clip, and in-product assistive features (such as an in-PMS AI chatbox), as described at https://phhotel.vn.',
              '1.2 Service: The right to access and use the Software for the subscribed term.',
              '1.3 Customer: Any individual or organization that registers for or uses the Service (accommodation businesses and operators).',
              '1.4 Admin Account: The highest-privilege account for the Customer’s tenant.',
              '1.5 User: Staff or parties granted access by the Customer.',
              '1.6 Activation / Suspension / Termination / Fees / Third Parties / Customer Data: as commonly understood for SaaS and as further described in this Agreement, including personal data under Vietnam Decree 13/2023/ND-CP.',
            ],
          },
        ],
      },
      {
        title: 'Article 2: Service and Activation',
        blocks: [
          {
            p: [
              'PHHotel provides hotel management services on web and mobile in accordance with Vietnamese law and product descriptions. After receiving admin access, the Customer must secure credentials and keep registration information accurate.',
            ],
          },
        ],
      },
      {
        title: 'Article 3–4: Fees and Payment',
        blocks: [
          {
            p: [
              'Fees are published at https://phhotel.vn, in-app, or in a separate quote/contract. Fees exclude third-party charges (banks, e-invoice, SMS, app stores). Payment is by bank transfer, online gateway, or other accepted methods. Prepaid periods keep the agreed rate until the paid term ends.',
            ],
          },
        ],
      },
      {
        title: 'Article 5–7: Suspension, Termination, Trial',
        blocks: [
          {
            p: [
              'PHHotel may suspend or terminate for non-payment, legal orders, material breach, or security/maintenance needs. Customers should export data before termination. Trials/demos may be offered and data deleted when the trial ends.',
            ],
          },
        ],
      },
      {
        title: 'Article 8–12: Duties, Support, Maintenance, Security',
        blocks: [
          {
            p: [
              'PHHotel provides the Service, reasonable support (support@phhotel.vn), and security measures. Customers must pay on time, use the Service lawfully for hospitality operations, protect accounts, and promptly report security incidents. The Customer is responsible for guest/employee personal data they upload and for obtaining required consents under Decree 13/2023/ND-CP.',
            ],
          },
        ],
      },
      {
        title: 'Article 13–15: Liability, Third Parties, IP',
        blocks: [
          {
            p: [
              'The Service is provided “as is”. To the extent permitted by law, PHHotel is not liable for indirect damages or third-party outages; aggregate liability is capped at fees paid in the three (3) months before the claim, except for willful misconduct where limitation is prohibited. Third-party services and any in-PMS AI outputs are the Customer’s responsibility to verify. PHHotel retains IP in the Software; Customers retain control of their operational data.',
            ],
          },
        ],
      },
      {
        title: 'Article 16–18: Confidentiality, Notices, Force Majeure',
        blocks: [
          {
            p: [
              'Both parties must protect confidential information. Notices may be sent in-app, by email, SMS, or website. Force majeure events excuse performance while they prevent it, subject to notice and reasonable mitigation.',
            ],
          },
        ],
      },
      {
        title: 'Article 19–25: Personal Data, Term, In-product AI',
        blocks: [
          {
            p: [
              'PHHotel may act as processor for guest/staff data entered by the Customer and as controller for account, billing, and technical logs. See https://phhotel.vn/privacy-policy. Vietnam law governs; disputes go to competent Vietnamese courts after good-faith negotiation. Updated terms are published at https://phhotel.vn/terms-of-service. Any in-PMS AI features are assistive only; Customers must review outputs and must not submit prohibited data.',
            ],
          },
        ],
      },
    ],
  },
};
