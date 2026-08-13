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
  sections: LegalSection[];
};

export const PRIVACY_DOCS: Record<'vi' | 'en', LegalDoc> = {
  vi: {
    title: 'Chính sách bảo mật',
    lastUpdatedLabel: 'Cập nhật lần cuối',
    sections: [
      {
        title: '1. GIỚI THIỆU',
        blocks: [
          {
            h3: '1.1',
            p: [
              'Website https://phhotel.vn/ được điều hành bởi Công ty TNHH Giải Pháp Công Nghệ PHGROUP, các chi nhánh trực thuộc và các tổ chức liên quan (được gọi riêng là "PHHotel", và gọi chung là "Chúng tôi", "của Chúng tôi" trong văn bản này). PHHotel cam kết tôn trọng quyền riêng tư và những vấn đề cá nhân của tất cả Người Dùng trên trang PHHotel ("Trang web") (Chúng tôi gọi chung Trang web và các dịch vụ Chúng tôi cung cấp được mô tả trên Trang web là "Dịch Vụ"). Chúng tôi nhận thức được tầm quan trọng của các dữ liệu cá nhân mà bạn đã giao phó cho Chúng tôi và tin rằng trách nhiệm của Chúng tôi là quản lý đúng cách, bảo vệ và xử lý dữ liệu cá nhân của bạn. Chính Sách Bảo Mật này (gọi tắt là "Chính Sách Bảo Mật" hay "Chính Sách") được tạo ra nhằm cung cấp các thông tin tổng quát về việc Chúng tôi sẽ thu thập, sử dụng, tiết lộ hoặc xử lý các dữ liệu cá nhân mà bạn đã cung cấp cho Chúng tôi như thế nào, cho dù ở hiện tại hay trong tương lai; cũng như cách mà Chúng tôi sẽ hỗ trợ bạn trước khi đưa ra bất cứ quyết định nào liên quan đến việc cung cấp dữ liệu cá nhân của bạn cho Chúng tôi. Xin vui lòng đọc Chính Sách Bảo Mật một cách cẩn thận. Nếu bạn có bất kỳ câu hỏi liên quan đến các thông tin này hoặc thực tiễn bảo mật của Chúng tôi, xin vui lòng xem phần "Thắc mắc? Liên hệ với Chúng tôi" ở phần cuối của Chính Sách Bảo Mật này.',
            ],
          },
          {
            h3: '1.2',
            p: [
              'Bằng cách sử dụng Dịch Vụ, đăng ký tài khoản với Chúng tôi, ghé thăm Trang web của Chúng tôi, hoặc truy cập vào Dịch vụ, bạn đã thừa nhận và đồng ý các yêu cầu, và/hoặc các Chính Sách, thực tiễn áp dụng nêu trong Chính Sách Bảo Mật này, và bạn đồng ý với Chúng tôi về việc thu thập, sử dụng, tiết lộ và/hoặc xử lý dữ liệu cá nhân của bạn theo cách được mô tả trong tài liệu này.',
            ],
            strongP:
              'NẾU BẠN KHÔNG ĐỒNG Ý VỚI CHÍNH SÁCH BẢO MẬT NÀY, VUI LÒNG KHÔNG SỬ DỤNG DỊCH VỤ CỦA CHÚNG TÔI HOẶC TRUY CẬP WEBSITE CỦA CHÚNG TÔI.',
          },
          {
            p: [
              'Nếu Chúng tôi thay đổi Chính Sách Bảo Mật, Chúng tôi sẽ cập nhật thay đổi hoặc sửa đổi đó trên Trang web của Chúng tôi. Chúng tôi bảo lưu quyền sửa đổi Chính Sách Bảo Mật này vào bất cứ lúc nào.',
            ],
          },
        ],
      },
      {
        title: '2. PHHOTEL THU THẬP NHỮNG THÔNG TIN GÌ?',
        blocks: [
          {
            h3: '2.1',
            p: [
              '"Dữ liệu cá nhân" được định nghĩa là dữ liệu, dù đúng hay sai, về một cá nhân – người mà có thể được xác định danh tính từ dữ liệu đó, hoặc từ dữ liệu và các thông tin khác mà một tổ chức có quyền hoặc có thể truy cập. Ví dụ thường gặp của dữ liệu cá nhân có thể bao gồm: Họ tên, số CMND và thông tin liên lạc.',
            ],
          },
          {
            h3: '2.2',
            p: ['Chúng tôi sẽ/có thể sẽ thu thập thông tin cá nhân về bạn:'],
            ul: [
              '(a) Khi bạn đăng ký và/hoặc sử dụng dịch vụ hoặc Trang web của Chúng tôi, hoặc mở một tài khoản với Chúng tôi;',
              '(b) Khi bạn gửi bất kỳ biểu mẫu nào, bao gồm nhưng không giới hạn đơn đăng ký hoặc các mẫu đơn khác liên quan đến bất kỳ sản phẩm và dịch vụ của Chúng tôi, cho dù trực tuyến hoặc bằng một hình thức chuyển phát khác;',
              '(c) Khi bạn đồng ý bất kỳ thỏa thuận nào hoặc cung cấp cho Chúng tôi tài liệu hoặc thông tin liên quan đến tương tác giữa bạn với Chúng tôi, hoặc khi bạn sử dụng các sản phẩm và dịch vụ của Chúng tôi;',
              '(d) Khi bạn tương tác với Chúng tôi, chẳng hạn như thông qua các cuộc gọi điện thoại (có thể được ghi âm lại), thư từ, fax, gặp trực tiếp, thông qua phương tiện truyền thông trên nền tảng mạng xã hội và thư điện tử;',
              '(e) Khi bạn sử dụng dịch vụ điện tử của Chúng tôi, hoặc tương tác với Chúng tôi qua ứng dụng, hoặc sử dụng các dịch vụ trên Trang web của Chúng tôi. Điều này bao gồm thông qua các tập tin Cookie mà Chúng tôi có thể triển khai khi bạn tương tác với các ứng dụng, Trang web hoặc Phần mềm của Chúng tôi;',
              '(f) Khi bạn thực hiện các giao dịch thông qua dịch vụ của Chúng tôi;',
              '(g) Khi bạn cung cấp cho Chúng tôi thông tin phản hồi hoặc khiếu nại;',
              '(h) Khi bạn gửi dữ liệu cá nhân của bạn cho Chúng tôi vì bất cứ lý do nào;',
            ],
          },
          {
            p: [
              'Trên đây chỉ là một số trường hợp phổ biến mà Chúng tôi thu thập dữ liệu cá nhân của bạn, không phản ánh hết toàn bộ các trường hợp mà Chúng tôi sẽ thu thập dữ liệu cá nhân của bạn.',
            ],
          },
          {
            h3: '2.3',
            p: [
              'Khi bạn truy cập, sử dụng hoặc tương tác với ứng dụng di động, Trang web hoặc Phần mềm của Chúng tôi, Chúng tôi có thể thu thập một số thông tin nhất định bằng phương tiện tự động hoặc thụ động bằng cách sử dụng một loạt các công nghệ, loại có thể tải về điện thoại của bạn và có thể thiết lập/sửa đổi cài đặt trên thiết bị của bạn. Thông tin Chúng tôi thu thập có thể bao gồm các địa chỉ giao thức Internet (IP), hệ điều hành của thiết bị máy tính/điện thoại di động và loại trình duyệt, loại thiết bị di động, đặc điểm của thiết bị di động đó, mã định danh thiết bị duy nhất (UDID) hoặc mã định danh thiết bị di động (MEID) cho thiết bị của bạn, địa chỉ của một Trang web giới thiệu (nếu có), lịch sử truy cập vào Trang web, Phần mềm và các ứng dụng di động của Chúng tôi.',
            ],
          },
          {
            h3: '2.4',
            p: [
              'Ứng dụng di động của Chúng tôi có thể thu thập thông tin chính xác về vị trí của thiết bị di động của bạn bằng cách sử dụng các công nghệ như GPS, Wi-Fi, v.v.. Đối với hầu hết các thiết bị di động, bạn có thể rút lại sự cho phép lấy thông tin vị trí của bạn thông qua mục cài đặt điện thoại.',
            ],
          },
          {
            h3: '2.5',
            p: ['Dữ liệu cá nhân được thu thập bao gồm, nhưng không giới hạn:'],
            ul: [
              'Họ tên',
              'Địa chỉ email',
              'Số điện thoại',
              'Địa chỉ nơi làm việc',
              'Chức vụ',
              'Địa điểm nơi làm việc',
              'Bất kỳ thông tin nào khác về Người Dùng khi Người Dùng đăng nhập và sử dụng dịch vụ hoặc Trang web của Chúng tôi',
              'Số liệu tổng hợp về lịch sử thao tác của Người Dùng',
            ],
          },
        ],
      },
      {
        title: '3. CÀI ĐẶT TÀI KHOẢN',
        blocks: [
          {
            p: [
              'Một số chức năng nhất định của Dịch Vụ yêu cầu bạn sẽ phải tạo một tài khoản Người Dùng và gửi dữ liệu cá nhân. Khi bạn đăng ký và tạo một tài khoản mới, Chúng tôi yêu cầu bạn cung cấp cho Chúng tôi những thông tin như họ tên, địa chỉ email, và tên Khách sạn nơi bạn làm việc. Chúng tôi cũng yêu cầu một số thông tin cá nhân như số điện thoại, địa chỉ email, địa chỉ khách sạn, số CMND…. Sau khi kích hoạt tài khoản, bạn sẽ chọn một tên Người Dùng và mật khẩu.',
            ],
          },
        ],
      },
      {
        title: '4. TRUY CẬP TRANG WEB',
        blocks: [
          {
            p: [
              'Như với hầu hết các Trang web, thiết bị của bạn có thể sẽ gửi đến Trang web của Chúng tôi một số thông tin cá nhân mà bạn dùng để đăng nhập. Thông tin này thường bao gồm nhưng không giới hạn: địa chỉ IP của máy tính, hệ điều hành, tên trình duyệt/tên phiên bản, các Trang web tham khảo, trang yêu cầu, ngày/giờ, và đôi khi là một "Cookie" (có thể được vô hiệu hóa bằng cách sử dụng tùy chọn trình duyệt của bạn).',
            ],
          },
        ],
      },
      {
        title: '5. COOKIES',
        blocks: [
          {
            h3: '5.1',
            p: [
              'Chúng tôi có thể sử dụng "Cookies" hoặc các tính năng khác để cho phép Chúng tôi hoặc các bên thứ ba thu thập hoặc chia sẻ những thông tin qua đó giúp Chúng tôi cải thiện Trang web và các Dịch vụ Chúng tôi cung cấp, hoặc giúp Chúng tôi cung cấp dịch vụ và tính năng mới.',
            ],
          },
          {
            h3: '5.2',
            p: [
              'Bạn có thể từ chối việc sử dụng các Cookie bằng cách chọn các thiết lập thích hợp trên trình duyệt. Tuy nhiên, xin vui lòng lưu ý rằng nếu bạn làm điều này bạn có thể không có khả năng sử dụng các chức năng đầy đủ của Trang web hoặc Dịch Vụ của Chúng tôi.',
            ],
          },
        ],
      },
      {
        title: '6. CỘNG ĐỒNG & HỖ TRỢ',
        blocks: [
          {
            p: [
              'Chúng tôi cung cấp dịch vụ hỗ trợ khách hàng qua email, tin nhắn SMS và các hình thức tương tác khác. Để hỗ trợ khách hàng, Chúng tôi sẽ yêu cầu khách hàng cung cấp địa chỉ email và số điện thoại di động. Chúng tôi chỉ sử dụng thông tin nhận được khi khách hàng yêu cầu hỗ trợ và sẽ không chuyển hoặc chia sẻ thông tin này với bất kỳ bên thứ ba nào khác.',
            ],
          },
        ],
      },
      {
        title: '7. KHẢO SÁT NGƯỜI DÙNG',
        blocks: [
          {
            p: [
              'Vào một thời điểm nào đó, Chúng tôi sẽ yêu cầu thông tin từ phía Người Dùng thông qua việc khảo sát. Việc tham gia vào các cuộc khảo sát là hoàn toàn tự nguyện. Thông tin khảo sát sẽ được sử dụng cho Mục Đích khảo sát và cải thiện việc sử dụng Dịch vụ và sẽ không được chuyển giao cho bên thứ ba.',
            ],
          },
        ],
      },
      {
        title: '8. CHÚNG TÔI SỬ DỤNG THÔNG TIN BẠN CUNG CẤP NHƯ THẾ NÀO?',
        blocks: [
          {
            h3: '8.1',
            p: [
              'Chúng tôi có thể thu thập, sử dụng, tiết lộ và/hoặc xử lý dữ liệu cá nhân của bạn cho một hoặc nhiều hơn các Mục Đích sau đây:',
            ],
            ul: [
              '(a) Để xem xét và/hoặc xử lý yêu cầu/giao dịch của bạn với Chúng tôi;',
              '(b) Để quản lý, vận hành, cung cấp và/hoặc quản trị việc sử dụng và/hoặc truy cập vào Dịch Vụ, Phần mềm hay Trang web của Chúng tôi;',
              '(c) Để quản lý, vận hành và cung cấp cho bạn cũng như tạo điều kiện cho việc cung cấp các Dịch Vụ của Chúng tôi;',
              '(d) Cải thiện trải nghiệm của bạn khi sử dụng Dịch Vụ;',
              '(e) Để tiếp nhận, xử lý, thương lượng hoặc hoàn thành một giao dịch và/hoặc để đáp ứng yêu cầu của bạn;',
              '(f) Để thực thi Điều khoản Dịch vụ của Chúng tôi;',
              '(g) Để bảo vệ an toàn cá nhân, các quyền, tài sản hoặc sự an toàn của người khác;',
              '(h) Để xác định hoặc thẩm tra;',
              '(i) Để duy trì và quản trị bất kỳ bản cập nhật phần mềm;',
              '(j) Xử lý hoặc tiến hành dịch vụ chăm sóc khách hàng;',
              '(k) Để liên hệ với bạn qua điện thoại, tin nhắn, thư điện tử và/hoặc thư bưu chính;',
              '(l) Để tiến hành nghiên cứu, phân tích và phát triển Dịch Vụ;',
              '(m) Dành cho Mục Đích tiếp thị (theo quy định pháp luật và/hoặc sự đồng ý của bạn);',
              '(n) Để sử dụng vào các vụ việc tố tụng hoặc để tuân thủ quy định pháp luật;',
              '(o) Để thu thập số liệu thống kê và nghiên cứu báo cáo nội bộ;',
              '(p) Để kiểm toán Dịch Vụ hoặc hoạt động kinh doanh của PHHotel;',
              '(q) Để ngăn ngừa hoặc điều tra mọi gian lận, hoạt động trái pháp luật;',
              '(r) Để lưu trữ, sao lưu, khôi phục dữ liệu cá nhân của bạn;',
              '(s) Để xử lý hoặc để thuận tiện cho các giao dịch liên quan đến PHHotel;',
              '(t) Bất kỳ Mục Đích nào khác mà Chúng tôi thông báo cho bạn tại thời điểm yêu cầu có sự đồng thuận của bạn.',
            ],
          },
          {
            p: ['(gọi chung là "Mục Đích");'],
          },
          {
            h3: '8.2',
            p: [
              'Một số Mục Đích thu thập, sử dụng, tiết lộ hoặc xử lý dữ liệu cá nhân còn tuỳ thuộc vào hoàn cảnh tại thời điểm thu thập. Chúng tôi sẽ thông báo cho bạn về những Mục Đích đó tại thời điểm hỏi xin sự đồng ý của bạn, trừ khi pháp luật cho phép xử lý mà không cần sự đồng ý.',
            ],
          },
        ],
      },
      {
        title: '9. PHHOTEL BẢO VỆ THÔNG TIN NGƯỜI DÙNG NHƯ THẾ NÀO?',
        blocks: [
          {
            p: [
              'Chúng tôi thực hiện một loạt các biện pháp an ninh để đảm bảo sự an toàn của dữ liệu cá nhân của bạn trên hệ thống của Chúng tôi. Dữ liệu Người Dùng được lưu trữ đằng sau mạng lưới bảo đảm và chỉ có thể truy cập bởi một số nhân viên có quyền truy cập đặc biệt tới hệ thống. Chúng tôi sẽ giữ lại dữ liệu cá nhân theo quy định pháp luật hiện hành và sẽ phá hủy hoặc ẩn danh hóa khi không còn cần thiết cho Mục Đích ban đầu hoặc nghĩa vụ pháp lý.',
            ],
          },
        ],
      },
      {
        title: '10. PHHOTEL CÓ TIẾT LỘ THÔNG TIN CÁ NHÂN CỦA BẠN RA BÊN NGOÀI KHÔNG?',
        blocks: [
          {
            h3: '10.1',
            p: [
              'Trong hoạt động kinh doanh, Chúng tôi sẽ/có thể cần tiết lộ dữ liệu cá nhân của bạn cho bên thứ ba cung cấp dịch vụ cho Chúng tôi, đại lý và/hoặc các chi nhánh hoặc công ty liên quan, cho một hoặc nhiều Mục Đích nêu trên. Các bên thứ ba đó bao gồm:',
            ],
            ul: [
              '(a) Các công ty con, chi nhánh và công ty liên quan của Chúng tôi;',
              '(b) Nhà thầu, đại lý, nhà cung cấp dịch vụ và các bên thứ ba hỗ trợ hoạt động kinh doanh;',
              '(c) Người mua hoặc người thừa kế trong trường hợp sáp nhập, tái cơ cấu, giải thể hoặc chuyển nhượng tài sản;',
              '(d) Bên thứ ba khác cho một hoặc nhiều Mục Đích nêu trên.',
            ],
          },
          {
            h3: '10.2',
            p: [
              'Việc chia sẻ thông tin mang tính thống kê và nhân khẩu học có thể được thực hiện với nhà cung cấp dịch vụ quảng cáo và lập trình, nhưng không bao gồm thông tin có thể nhận dạng bạn một cách đặc biệt.',
            ],
          },
          {
            h3: '10.3',
            p: [
              'Trong trường hợp pháp luật cho phép thu thập, sử dụng hoặc tiết lộ dữ liệu cá nhân mà không cần sự đồng ý của bạn, sự cho phép đó vẫn tiếp tục được áp dụng.',
            ],
          },
          {
            h3: '10.4',
            p: [
              'Chính Sách Bảo Mật này không phải là lời hứa rằng dữ liệu cá nhân của bạn sẽ không bao giờ bị tiết lộ trái phép do tấn công mạng tinh vi. Chúng tôi luôn triển khai các biện pháp an ninh hợp lý theo quy định pháp luật hiện hành.',
            ],
          },
        ],
      },
      {
        title: '11. THÔNG TIN THU THẬP CỦA BÊN THỨ BA',
        blocks: [
          {
            h3: '11.1',
            p: [
              'Trang web của Chúng tôi sử dụng Google Analytics, một dịch vụ phân tích web được cung cấp bởi Google, Inc. ("Google"). Google Analytics sử dụng Cookie để giúp phân tích cách Người Dùng sử dụng các Trang web. Thông tin được tạo ra bởi Cookie (bao gồm địa chỉ IP của bạn) có thể được truyền đến và lưu trữ bởi Google trên máy chủ tại Hoa Kỳ.',
            ],
          },
          {
            h3: '11.2',
            p: [
              'Các ứng dụng hoặc dịch vụ của bên thứ ba có thể xem được một số thông tin danh tính của bạn. Sản phẩm/dịch vụ do bên thứ ba cung cấp không thuộc sở hữu và quyền quản lý của PHHotel. Chúng tôi khuyến khích bạn đọc kỹ điều khoản và chính sách của họ.',
            ],
          },
        ],
      },
      {
        title: '12. KHUYẾN CÁO VỀ AN NINH VÀ WEBSITE BÊN THỨ BA',
        blocks: [
          {
            h3: '12.1',
            strongP:
              'CHÚNG TÔI KHÔNG BẢO ĐẢM AN NINH CÁ NHÂN VÀ/HOẶC THÔNG TIN KHÁC MÀ BẠN CUNG CẤP cho Website bên thứ ba.',
            p: [
              'Chúng tôi thực hiện các biện pháp an ninh để duy trì sự an toàn của dữ liệu cá nhân dưới sự sở hữu hoặc kiểm soát của Chúng tôi.',
            ],
          },
          {
            h3: '12.2',
            p: [
              'Các trang web liên kết có chính sách bảo mật và thỏa thuận an ninh riêng. Chúng tôi không kiểm soát các trang web liên kết đó.',
            ],
          },
          {
            h3: '12.3',
            p: [
              'Chúng tôi không có trách nhiệm đối với nội dung, biện pháp an ninh và hoạt động của các trang web liên kết. Các liên kết chỉ phục vụ sự thuận tiện của bạn.',
            ],
          },
        ],
      },
      {
        title: '13. TRUY CẬP TRANG WEB CỦA CHÚNG TÔI TỪ NƯỚC NGOÀI?',
        blocks: [
          {
            p: [
              'Nếu bạn đang truy cập Trang web của Chúng tôi từ nước ngoài, dữ liệu cá nhân của bạn có thể được chuyển giao, lưu trữ, xử lý tại nơi các máy chủ và cơ sở dữ liệu trung tâm của Chúng tôi được điều hành. Bằng cách sử dụng Trang web hoặc dịch vụ của Chúng tôi, bạn thừa nhận việc chuyển giao dữ liệu như mô tả trong Chính Sách này.',
            ],
          },
        ],
      },
      {
        title: '14. LÀM THẾ NÀO ĐỂ KHÔNG THAM GIA, BỎ, YÊU CẦU TRUY CẬP, HOẶC THAY ĐỔI THÔNG TIN?',
        blocks: [
          {
            h3: '14.1 Từ chối nhận và Hủy Đồng ý',
            h4: '14.1.1',
            p: [
              'Để sửa đổi đăng ký nhận tin qua thư điện tử, vui lòng gửi email tới bộ phận Chăm sóc khách hàng theo địa chỉ ở Mục 15.',
            ],
          },
          {
            h4: '14.1.2',
            p: [
              'Bạn có thể rút lại sự đồng ý đối với việc thu thập, sử dụng và/hoặc tiết lộ dữ liệu cá nhân bằng cách gửi email tới bộ phận Chăm sóc khách hàng.',
            ],
          },
          {
            h4: '14.1.3',
            p: [
              'Sau khi xác minh danh tính, Chúng tôi sẽ xử lý yêu cầu hủy đồng ý và không thu thập, sử dụng và/hoặc tiết lộ dữ liệu theo cách thức nêu trong yêu cầu của bạn.',
            ],
          },
          {
            h4: '14.1.4',
            p: [
              'Việc rút lại chấp thuận có thể dẫn đến việc Chúng tôi không thể tiếp tục cung cấp Dịch Vụ và có thể phải chấm dứt mối quan hệ hoặc hợp đồng với bạn.',
            ],
          },
          {
            h3: '14.2 Yêu cầu truy cập và/hoặc chỉnh sửa dữ liệu cá nhân',
            h4: '14.2.1',
            p: [
              'Nếu đã có tài khoản, bạn có thể truy cập và/hoặc sửa dữ liệu qua trang Cài đặt tài khoản. Nếu chưa có tài khoản, vui lòng gửi yêu cầu bằng văn bản qua email theo Mục 15.',
            ],
          },
          {
            h4: '14.2.2',
            p: [
              'Đối với yêu cầu truy cập, Chúng tôi sẽ cung cấp dữ liệu liên quan trong vòng 30 ngày (hoặc thông báo thời gian sớm nhất có thể).',
            ],
          },
          {
            h4: '14.2.3',
            p: ['Đối với yêu cầu chỉnh sửa, khi có đủ thông tin Chúng tôi sẽ:'],
            ul: [
              '(a) Chỉnh sửa dữ liệu cá nhân trong vòng 30 ngày (hoặc thông báo thời gian sớm nhất);',
              '(b) Gửi dữ liệu đã chỉnh sửa tới tổ chức liên quan theo quy định pháp luật và Chính Sách này.',
            ],
          },
          {
            h4: '14.2.5',
            p: [
              'Chúng tôi bảo lưu quyền từ chối chỉnh sửa dữ liệu cá nhân theo các trường hợp pháp luật cho phép.',
            ],
          },
        ],
      },
      {
        title: '15. CÂU HỎI, THẮC MẮC HOẶC KHIẾU NẠI? LIÊN HỆ VỚI CHÚNG TÔI',
        blocks: [
          {
            h3: '15.1',
            p: [
              'Nếu bạn có câu hỏi về bảo mật hoặc giao dịch với Dịch Vụ, vui lòng liên hệ PHHotel tại email support@phhotel.vn',
            ],
          },
          {
            h3: '15.2',
            p: [
              'Nếu bạn có khiếu nại về cách Chúng tôi xử lý dữ liệu cá nhân, vui lòng liên hệ email support@phhotel.vn hoặc hotline 1900 6159.',
            ],
          },
          {
            h3: '15.3',
            p: [
              'Khi gửi khiếu nại qua thư/email, vui lòng ghi rõ tiêu đề liên quan đến bảo vệ dữ liệu cá nhân để Chúng tôi xử lý nhanh hơn. Chúng tôi sẽ cố gắng phản hồi sớm nhất có thể.',
            ],
          },
        ],
      },
      {
        title: '16. LUẬT ĐIỀU CHỈNH',
        blocks: [
          {
            p: [
              'Chính Sách Bảo Mật này được điều chỉnh bởi pháp luật của nước Cộng hòa Xã hội chủ nghĩa Việt Nam.',
            ],
          },
        ],
      },
      {
        title: '17. CÁC ĐIỀU KHOẢN VÀ ĐIỀU KIỆN',
        blocks: [
          {
            p: [
              'Xin vui lòng đọc Điều khoản Dịch vụ về việc sử dụng, từ bỏ và giới hạn trách nhiệm khi sử dụng các Trang web, Dịch Vụ và các chính sách liên quan khác.',
            ],
          },
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    lastUpdatedLabel: 'Last updated',
    sections: [
      {
        title: '1. INTRODUCTION',
        blocks: [
          {
            h3: '1.1',
            p: [
              'The website https://phhotel.vn/ is operated by PHGROUP Technology Solutions Co., Ltd., its branches and related organizations (individually “PHHotel”, and collectively “we”, “us”, or “our” in this document). PHHotel is committed to respecting the privacy and personal matters of all Users on the PHHotel site (“Website”) (we collectively refer to the Website and the services described on it as the “Services”). We understand the importance of the personal data you entrust to us and believe it is our responsibility to properly manage, protect, and process your personal data. This Privacy Policy (the “Privacy Policy” or “Policy”) provides general information about how we collect, use, disclose, or process personal data you provide to us, now or in the future, and how we support you before you decide to provide personal data to us. Please read this Privacy Policy carefully. If you have questions about this information or our privacy practices, please see “Questions? Contact us” at the end of this Policy.',
            ],
          },
          {
            h3: '1.2',
            p: [
              'By using the Services, registering an account with us, visiting our Website, or accessing the Services, you acknowledge and agree to the requirements and/or policies and practices set out in this Privacy Policy, and you agree that we may collect, use, disclose and/or process your personal data as described in this document.',
            ],
            strongP:
              'IF YOU DO NOT AGREE WITH THIS PRIVACY POLICY, PLEASE DO NOT USE OUR SERVICES OR ACCESS OUR WEBSITE.',
          },
          {
            p: [
              'If we change this Privacy Policy, we will update the changes on our Website. We reserve the right to amend this Privacy Policy at any time.',
            ],
          },
        ],
      },
      {
        title: '2. WHAT INFORMATION DOES PHHOTEL COLLECT?',
        blocks: [
          {
            h3: '2.1',
            p: [
              '“Personal data” means data, whether true or not, about an individual who can be identified from that data, or from that data and other information an organization has or is likely to have access to. Common examples include name, ID number, and contact details.',
            ],
          },
          {
            h3: '2.2',
            p: ['We will/may collect personal information about you:'],
            ul: [
              '(a) When you register for and/or use our services or Website, or open an account with us;',
              '(b) When you submit any forms, including but not limited to applications relating to our products and services, online or otherwise;',
              '(c) When you enter into any agreement or provide documents or information relating to your interaction with us, or when you use our products and services;',
              '(d) When you interact with us, such as by phone (which may be recorded), letter, fax, in person, social media, or email;',
              '(e) When you use our electronic services, interact with us via an application, or use services on our Website, including through Cookies we may deploy;',
              '(f) When you carry out transactions through our services;',
              '(g) When you provide feedback or complaints;',
              '(h) When you send us personal data for any reason;',
            ],
          },
          {
            p: [
              'The above are common situations and do not reflect every circumstance in which we may collect your personal data.',
            ],
          },
          {
            h3: '2.3',
            p: [
              'When you access, use, or interact with our mobile application, Website, or Software, we may collect certain information automatically or passively using various technologies. Information may include IP address, computer/mobile OS and browser type, mobile device type and characteristics, unique device identifiers (UDID/MEID), referring website (if any), and browsing history on our Website, Software, and mobile applications.',
            ],
          },
          {
            h3: '2.4',
            p: [
              'Our mobile application may collect precise location information using technologies such as GPS and Wi‑Fi. On most devices, you can withdraw location permission in device settings.',
            ],
          },
          {
            h3: '2.5',
            p: ['Personal data collected includes, but is not limited to:'],
            ul: [
              'Full name',
              'Email address',
              'Phone number',
              'Workplace address',
              'Job title',
              'Workplace location',
              'Any other information about the User when the User logs in and uses our services or Website',
              'Aggregated metrics about the User’s activity history',
            ],
          },
        ],
      },
      {
        title: '3. ACCOUNT SETUP',
        blocks: [
          {
            p: [
              'Certain Service features require you to create a User account and submit personal data. When you register, we may request information such as full name, email address, and the hotel where you work, as well as phone number, hotel address, and ID number. After activation, you will choose a username and password to securely access and maintain your account.',
            ],
          },
        ],
      },
      {
        title: '4. WEBSITE ACCESS',
        blocks: [
          {
            p: [
              'As with most websites, your device may send certain information when you log in, typically including IP address, operating system, browser name/version, referring sites, requested page, date/time, and sometimes a Cookie (which you may disable in browser settings).',
            ],
          },
        ],
      },
      {
        title: '5. COOKIES',
        blocks: [
          {
            h3: '5.1',
            p: [
              'We may use Cookies or similar features to allow us or third parties to collect or share information that helps us improve the Website and Services, or offer new services and features.',
            ],
          },
          {
            h3: '5.2',
            p: [
              'You may refuse Cookies by selecting appropriate browser settings. Please note that doing so may prevent you from using the full functionality of our Website or Services.',
            ],
          },
        ],
      },
      {
        title: '6. COMMUNITY & SUPPORT',
        blocks: [
          {
            p: [
              'We provide customer support via email, SMS, and other channels. To provide support, we may request email address and mobile phone number. We use information received for support requests only and do not transfer or share it with other third parties for other purposes.',
            ],
          },
        ],
      },
      {
        title: '7. USER SURVEYS',
        blocks: [
          {
            p: [
              'From time to time, we may request information through surveys. Participation is voluntary. Survey information is used for survey purposes and to improve the Services and will not be transferred to third parties.',
            ],
          },
        ],
      },
      {
        title: '8. HOW DO WE USE THE INFORMATION YOU PROVIDE?',
        blocks: [
          {
            h3: '8.1',
            p: [
              'We may collect, use, disclose and/or process your personal data for one or more of the following Purposes:',
            ],
            ul: [
              '(a) To consider and/or process your requests/transactions with us;',
              '(b) To manage, operate, provide and/or administer use of and/or access to our Services, Software, or Website;',
              '(c) To manage, operate, and facilitate provision of our Services;',
              '(d) To improve your experience when using the Services;',
              '(e) To receive, process, negotiate, or complete a transaction and/or fulfill your requests;',
              '(f) To enforce our Terms of Service;',
              '(g) To protect personal safety, rights, property, or safety of others;',
              '(h) For identification or verification;',
              '(i) To maintain and administer software updates;',
              '(j) To handle customer care services;',
              '(k) To contact you by phone, message, email and/or post;',
              '(l) To conduct research, analysis, and development of the Services;',
              '(m) For marketing purposes (in accordance with law and/or your consent);',
              '(n) For legal proceedings or to comply with legal/regulatory requirements;',
              '(o) To compile statistics and internal reports;',
              '(p) To audit PHHotel Services or business operations;',
              '(q) To prevent or investigate fraud or unlawful activity;',
              '(r) To store, back up, and restore your personal data;',
              '(s) To process or facilitate transactions involving PHHotel;',
              '(t) Any other Purpose we notify you of when seeking your consent.',
            ],
          },
          {
            p: ['(collectively, the “Purposes”);'],
          },
          {
            h3: '8.2',
            p: [
              'Some Purposes depend on the circumstances at the time of collection. We will notify you of those Purposes when seeking consent, unless processing without consent is permitted by law.',
            ],
          },
        ],
      },
      {
        title: '9. HOW DOES PHHOTEL PROTECT USER INFORMATION?',
        blocks: [
          {
            p: [
              'We implement a range of security measures to safeguard your personal data on our systems. User data is stored behind secured networks and accessible only by limited staff with special access rights. We retain personal data as required by applicable law and will destroy or anonymize it when it is no longer needed for the original Purpose or legal obligations.',
            ],
          },
        ],
      },
      {
        title: '10. DOES PHHOTEL DISCLOSE YOUR PERSONAL INFORMATION EXTERNALLY?',
        blocks: [
          {
            h3: '10.1',
            p: [
              'In our business operations, we may need to disclose your personal data to third-party service providers, agents, and/or our affiliates for one or more of the Purposes above. Such third parties include:',
            ],
            ul: [
              '(a) Our subsidiaries, branches, and related companies;',
              '(b) Contractors, agents, service providers, and other third parties supporting our business;',
              '(c) A buyer or successor in a merger, restructuring, dissolution, or asset transfer;',
              '(d) Other third parties for one or more of the Purposes above.',
            ],
          },
          {
            h3: '10.2',
            p: [
              'Statistical and demographic information about Users may be shared with advertising and programming providers, but will not include anything that can specifically identify you.',
            ],
          },
          {
            h3: '10.3',
            p: [
              'Where data protection or other laws allow an organization like us to collect, use, or disclose your personal data without consent, such permission continues to apply.',
            ],
          },
          {
            h3: '10.4',
            p: [
              'This Privacy Policy is not a promise that your personal data will never be disclosed due to sophisticated malicious hacking. We always implement reasonable security measures required by applicable law.',
            ],
          },
        ],
      },
      {
        title: '11. INFORMATION COLLECTED BY THIRD PARTIES',
        blocks: [
          {
            h3: '11.1',
            p: [
              'Our Website uses Google Analytics, a web analytics service provided by Google, Inc. (“Google”). Google Analytics uses Cookies to help analyze how Users use websites. Information generated by Cookies about your use of the Website (including your IP address) may be transmitted to and stored by Google on servers in the United States.',
            ],
          },
          {
            h3: '11.2',
            p: [
              'Third-party applications or services may be able to view certain identity information. Products/services provided by third parties are not owned or controlled by PHHotel. Please read their terms and policies carefully.',
            ],
          },
        ],
      },
      {
        title: '12. SECURITY NOTICE AND THIRD-PARTY WEBSITES',
        blocks: [
          {
            h3: '12.1',
            strongP:
              'WE DO NOT GUARANTEE THE SECURITY OF PERSONAL AND/OR OTHER INFORMATION YOU PROVIDE to third-party websites.',
            p: [
              'We implement security measures to maintain the safety of personal data under our ownership or control.',
            ],
          },
          {
            h3: '12.2',
            p: [
              'Linked websites have separate privacy policies and security arrangements. We do not control those linked websites.',
            ],
          },
          {
            h3: '12.3',
            p: [
              'We are not responsible for the content, security measures, or activities of linked websites. Links are provided for your convenience only.',
            ],
          },
        ],
      },
      {
        title: '13. ACCESSING OUR WEBSITE FROM ABROAD?',
        blocks: [
          {
            p: [
              'If you access our Website from outside Vietnam, your personal data and/or information may be transferred to, stored, and processed where our servers and central databases are operated. By using our Website or Services, you acknowledge such transfers as described in this Policy.',
            ],
          },
        ],
      },
      {
        title: '14. HOW TO OPT OUT, WITHDRAW, REQUEST ACCESS, OR CHANGE INFORMATION?',
        blocks: [
          {
            h3: '14.1 Opt-out and Withdrawal of Consent',
            h4: '14.1.1',
            p: [
              'To change your email subscription preferences, please email our Customer Care team at the address in Section 15.',
            ],
          },
          {
            h4: '14.1.2',
            p: [
              'You may withdraw consent to our collection, use and/or disclosure of your personal data by emailing Customer Care.',
            ],
          },
          {
            h4: '14.1.3',
            p: [
              'After verifying your identity, we will process your withdrawal request and will not collect, use and/or disclose your personal data in the manner stated in your request.',
            ],
          },
          {
            h4: '14.1.4',
            p: [
              'Withdrawing consent may mean we can no longer provide the Services to you and may need to terminate our relationship or contract with you.',
            ],
          },
          {
            h3: '14.2 Access and/or Correction Requests',
            h4: '14.2.1',
            p: [
              'If you have an account, you may access and/or correct your data via Account Settings. If not, please submit a written request by email as listed in Section 15.',
            ],
          },
          {
            h4: '14.2.2',
            p: [
              'For access requests, once we have sufficient information, we will provide the relevant personal data within 30 days (or notify you of the earliest practicable time).',
            ],
          },
          {
            h4: '14.2.3',
            p: ['For correction requests, once we have sufficient information we will:'],
            ul: [
              '(a) Correct your personal data within 30 days (or notify you of the earliest practicable time);',
              '(b) Send corrected data to relevant organizations as required by law and this Policy.',
            ],
          },
          {
            h4: '14.2.5',
            p: [
              'We reserve the right to refuse correction of personal data in circumstances permitted by applicable law.',
            ],
          },
        ],
      },
      {
        title: '15. QUESTIONS, CONCERNS, OR COMPLAINTS? CONTACT US',
        blocks: [
          {
            h3: '15.1',
            p: [
              'If you have questions about our privacy practices or your transactions with the Services, please contact PHHotel at support@phhotel.vn',
            ],
          },
          {
            h3: '15.2',
            p: [
              'If you have a complaint about how we process your personal data, please contact support@phhotel.vn or hotline 1900 6159.',
            ],
          },
          {
            h3: '15.3',
            p: [
              'When sending a complaint by letter/email, please include a clear subject line related to personal data protection so we can route it quickly. We will try to respond as soon as possible.',
            ],
          },
        ],
      },
      {
        title: '16. GOVERNING LAW',
        blocks: [
          {
            p: [
              'This Privacy Policy is governed by the laws of the Socialist Republic of Vietnam.',
            ],
          },
        ],
      },
      {
        title: '17. TERMS AND CONDITIONS',
        blocks: [
          {
            p: [
              'Please also read the Terms of Service regarding use, waivers, and limitations of liability when using the Website, Services, and related policies.',
            ],
          },
        ],
      },
    ],
  },
};
