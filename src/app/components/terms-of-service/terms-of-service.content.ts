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

export const TERMS_DOCS: Record<'vi' | 'en', LegalDoc> = {
  vi: {
    title: 'THỎA THUẬN CHẤP THUẬN BẢO VỆ VÀ XỬ LÝ DỮ LIỆU CÁ NHÂN',
    lastUpdatedLabel: 'Cập nhật lần cuối',
    subtitle:
      '(Theo Nghị định số 13/2023/NĐ-CP của chính phủ về Bảo vệ Dữ liệu cá nhân, có hiệu lực từ ngày 01/07/2023)',
    sections: [
      {
        title: '',
        blocks: [
          {
            p: ['Thỏa thuận này được lập và ký vào ngày …/…/… bởi:'],
          },
          {
            strongP: 'Họ tên:',
          },
          {
            p: [
              'CMND/CCCD/Hộ chiếu số: …………………… ngày cấp …………………… nơi cấp ………..',
            ],
          },
          {
            strongP: 'Địa chỉ thường trú:',
          },
          {
            p: ['………………………………………………………………………………'],
          },
          {
            strongP: 'Số điện thoại:',
          },
          {
            p: ['……………………………………………………………………………………..'],
          },
          {
            p: ['(sau đây gọi là "Bên Cung Cấp")'],
          },
          {
            p: [
              'Bên Cung Cấp tự nguyện đồng ý tuân thủ các quy định về bảo vệ Dữ liệu cá nhân với các điều khoản sau đây:',
            ],
          },
        ],
      },
      {
        title: 'Điều 1: Định nghĩa',
        blocks: [
          {
            p: [
              '"Hợp đồng" là thuật ngữ gọi chung cho các hợp đồng giữa Bên Cung Cấp và PHHotel và/hoặc các biên bản, thỏa thuận, phụ lục, tài liệu liên quan tới các Hợp đồng đó. Đó có thể là hợp đồng lao động, hợp đồng thử việc, hợp đồng khác, v.v.',
            ],
          },
          {
            p: [
              '"Dữ liệu cá nhân" là thông tin dưới dạng ký hiệu, chữ viết, chữ số, hình ảnh, âm thanh hoặc dạng tương tự trên môi trường điện tử gắn liền với một con người cụ thể hoặc giúp xác định một con người cụ thể. Dữ liệu cá nhân được đề cập trong bản Thỏa thuận này là Dữ liệu cá nhân của bất kỳ chủ thể dữ liệu nào mà PHHotel có được từ Bên Cung Cấp, nó có thể là Dữ liệu cá nhân của chính Bên Cung Cấp, hoặc Dữ liệu cá nhân của các chủ thể khác mà Bên Cung Cấp đã thu thập một cách hợp pháp và được phép chuyển giao, cung cấp cho PHHotel để PHHotel thực hiện các công việc được nêu trong (các) Hợp đồng giữa PHHotel và Bên Cung Cấp.',
            ],
          },
          {
            p: [
              '"Luật bảo vệ dữ liệu" có nghĩa là tất cả các luật và quy định về bảo vệ Dữ liệu cá nhân hoặc quyền riêng tư áp dụng cho hoạt động xử lý Dữ liệu cá nhân tại Việt Nam, trong đó bao gồm nhưng không giới hạn ở Luật An ninh quốc gia 2004, Luật An ninh mạng 2018; Nghị định Số 13/2023/NĐ-CP về bảo vệ Dữ liệu cá nhân cùng các bản sửa đổi, bổ sung, thay thế các văn bản trên.',
            ],
          },
          {
            p: [
              '"PHHotel" bao gồm nhân viên của PHHotel, các chi nhánh/công ty mẹ/công ty con và các công ty liên quan của PHHotel.',
            ],
          },
          {
            p: [
              '"Hoạt động nhân sự" là các công việc, hoạt động về nhân sự mà PHHotel thực hiện đối với Bên Cung Cấp bao gồm nhưng không giới hạn việc tuyển dụng, ký kết và thực hiện Hợp đồng thử việc, ký kết và thực hiện Hợp đồng lao động, trả lương, thưởng, phụ cấp, phúc lợi, đào tạo, bổ nhiệm, điều chuyển, miễn nhiệm, khen thưởng, kỷ luật, đình chỉ, chấm dứt hợp đồng lao động và việc thực hiện các công việc, hoạt động khác về nhân sự.',
            ],
          },
          {
            p: [
              'Các thuật ngữ "Dữ liệu cá nhân", "chủ thể dữ liệu", "xử lý Dữ liệu cá nhân", "bên kiểm soát" và "bên kiểm soát và xử lý" được sử dụng trong bản Thỏa thuận này có các ý nghĩa như được quy định tại Nghị định số 13/2023/NĐ-CP về bảo vệ Dữ liệu cá nhân và các bản sửa đổi, bổ sung kèm theo (nếu có).',
            ],
          },
        ],
      },
      {
        title: 'Điều 2. Nội dung chấp thuận',
        blocks: [
          {
            h3: '1.',
            p: [
              'Các bên thừa nhận và đồng ý như sau: (i) PHHotel là Bên kiểm soát Dữ liệu hoặc Bên xử lý Dữ liệu hoặc Bên kiểm soát và xử lý Dữ liệu, tùy từng trường hợp cụ thể; (ii) Bên Cung Cấp là chủ thể dữ liệu hoặc Bên kiểm soát Dữ liệu hoặc Bên kiểm soát và xử lý Dữ liệu, tùy từng trường hợp cụ thể; và (iii) mỗi bên sẽ tuân thủ các nghĩa vụ của mình theo Luật bảo vệ dữ liệu hiện hành liên quan đến việc xử lý Dữ liệu cá nhân.',
            ],
          },
          {
            h3: '2.',
            p: [
              'Bên Cung Cấp xác nhận và đồng ý rằng PHHotel được phép thu thập Dữ liệu cá nhân của Bên Cung Cấp (trực tiếp hoặc gián tiếp) từ các nguồn cung cấp dữ liệu khác nhau, bao gồm nhưng không giới hạn: (i) từ các thông tin mà Bên Cung Cấp cung cấp (bằng lời nói, văn bản) khi được tuyển dụng, ký kết Hợp đồng, trong quá trình làm việc tại PHHotel, hoặc theo các chương trình khảo sát mà Bên Cung Cấp tham gia; (ii) từ cơ quan nhà nước, các nhà cung cấp, bên cung cấp dịch vụ, đối tác của PHHotel và các bên thứ ba khác, bao gồm nhưng không giới hạn các bên tư vấn về dịch vụ nhân sự, ngân hàng, tổ chức tín dụng, tổ chức việc làm, người thân của Bên Cung Cấp, …..; (iii) từ nguồn thông tin công cộng có sẵn; (iv) thông qua các tập tin được tạo ra bởi trang mạng mà Bên Cung Cấp truy cập (cookie) hoặc các thiết bị/công cụ giám sát tương tự.',
              'Bên Cung Cấp có thể tham khảo để hiểu rõ hơn cách thu thập thông tin trên website của PHHotel tại https://phhotel.vn/terms-of-service',
            ],
          },
          {
            h3: '3.',
            p: [
              'Bên Cung Cấp đồng ý PHHotel có quyền xử lý các Dữ liệu cá nhân của Bên Cung Cấp bao gồm các Dữ liệu cá nhân cơ bản và các Dữ liệu cá nhân nhạy cảm và các dữ liệu được cập nhật, sửa đổi, bổ sung tại từng thời điểm, trong đó:',
            ],
          },
          {
            strongP:
              'Dữ liệu cá nhân cơ bản bao gồm họ tên, ngày tháng năm sinh, giới tính, nơi sinh, địa chỉ thường trú, địa chỉ liên hệ, quốc tịch, hình ảnh, số điện thoại, email, chứng minh nhân dân/căn cước công dân/hộ chiếu/giấy tờ nhận diện khác, thông tin về mối quan hệ gia đình, tài khoản số, Dữ liệu cá nhân phản ánh hoạt động, lịch sử hoạt động trên không gian mạng, các thông tin, dữ liệu khác gắn liền với cá nhân hoặc giúp xác định một cá nhân cụ thể và các thông tin, dữ liệu khác theo quy định của pháp luật; và',
          },
          {
            strongP:
              'Dữ liệu cá nhân nhạy cảm bao gồm tình trạng sức khỏe và đời tư, chủng tộc, dân tộc, đặc điểm di truyền, thuộc tính vật lý, thông tin sinh trắc học (vân tay), tình trạng việc làm, dữ liệu về tội phạm, hành vi phạm tội, thông tin khách hàng của tổ chức tín dụng, chi nhánh ngân hàng nước ngoài, tổ chức cung ứng dịch vụ trung gian thanh toán, tổ chức được phép khác, gồm: thông tin về tài khoản, thông tin về tiền gửi, thông tin về tài sản gửi, thông tin về giao dịch, thông tin về tổ chức, cá nhân là bên bảo đảm tại tổ chức tín dụng, chi nhánh ngân hàng, tổ chức cung ứng dịch vụ trung gian thanh toán; dữ liệu về vị trí của cá nhân được xác định qua dịch vụ định vị, dữ liệu khác được pháp luật quy định là đặc thù và cần có biện pháp bảo mật cần thiết',
          },
          {
            h3: '4.',
            p: [
              'Bên Cung Cấp đồng ý và xác nhận rằng các Dữ liệu cá nhân của Bên Cung Cấp được xử lý cho một hoặc nhiều hơn các Mục Đích sau:',
            ],
            ul: [
              'Xác thực, định danh Bên Cung Cấp, đánh giá và thẩm định để giao kết Hợp đồng;',
              'Để phục vụ cho việc cung cấp, vận hành, xử lý và quản lý của PHHotel đối với hoạt động nhân sự liên quan đến Bên Cung Cấp, và để phục vụ các mục đích khác mà PHHotel xác định phù hợp tại từng thời điểm;',
              'Thực hiện và tuân thủ Hợp đồng ký kết với Bên Cung Cấp và thực hiện các hoạt động nhân sự tới Bên Cung Cấp;',
              'Để phục vụ công tác kiểm tra của Ngân hàng Nhà nước, tổ chức giáo dục, doanh nghiệp hoặc cơ quan có liên quan khác (nếu cần);',
              'Để đánh giá và/hoặc xử lý yêu cầu/đề nghị của Bên Cung Cấp đối với bất kỳ hoạt động nhân sự nào (bao gồm nhưng không giới hạn ở những sản phẩm của bên thứ ba chẳng hạn như các chính sách bảo hiểm, y tế…);',
              'Để cung cấp/gửi thông tin, tài liệu liên quan đến hoạt động nhân sự, phục vụ công việc quy định tại Hợp đồng cho Bên Cung Cấp;',
              'Để nhập và kiểm tra tính đầy đủ và chính xác của các dữ liệu Bên Cung Cấp được nhập vào hệ thống',
              'Khảo sát và thăm dò sự hài lòng để cải thiện chất lượng các hoạt động nhân sự;',
              'Tiếp nhận và liên hệ để trả lời các thắc mắc, xử lý các yêu cầu, khiếu nại;',
              'Thực hiện kiểm soát, bảo vệ quyền của PHHotel, quản lý rủi ro, ngăn ngừa và điều tra mọi gian lận, hoạt động trái phép, thiếu sót hay hành vi sai trái, giải quyết tranh chấp, thực hiện các hoạt động tố tụng;',
              'Bảo đảm an ninh công cộng và an toàn lao động, bảo vệ an toàn cá nhân, các quyền, tài sản hoặc sự an toàn của người khác;',
              'Để thực hiện các quy định liên quan đến bảo vệ an toàn hệ thống của PHHotel và bảo vệ dữ liệu cá nhân Bên Cung Cấp;',
              'Thu thập số liệu thống kê và nghiên cứu báo cáo nội bộ theo luật định và/hoặc yêu cầu lưu giữ hồ sơ;',
              'Phục vụ hoạt động kiểm toán, quản lý rủi ro và tuân thủ của PHHotel;',
              'Để đáp ứng hoặc tuân thủ các chính sách nội bộ của PHHotel và các nghĩa vụ pháp luật hoặc theo yêu cầu của cơ quan Nhà nước có thẩm quyền;',
              'Thực hiện các mục đích khác có liên quan đến hoạt động kinh doanh, vận hành, quản lý và tuân thủ của PHHotel phù hợp với quy định của pháp luật từng thời kỳ.',
            ],
            p: [
              'Một số Mục Đích thu thập, sử dụng, tiết lộ hoặc xử lý dữ liệu cá nhân còn tuỳ thuộc vào hoàn cảnh tại thời điểm thu thập, nên sẽ không xuất hiện trong danh sách trên. Tuy nhiên, PHHotel sẽ thông báo cho Bên Cung Cấp về những Mục Đích đó tại thời điểm cần sự đồng ý của Bên Cung Cấp, trừ khi việc xử lý dữ liệu cá nhân mà không cần sự đồng ý của chủ thể dữ liệu theo quy định pháp luật.',
            ],
          },
          {
            h3: '5.',
            p: [
              'Để thực hiện các mục đích xử lý dữ liệu cá nhân theo quy định tại khoản 3 Điều này, Bên Cung Cấp chấp thuận, cho phép đại diện và ủy quyền cho PHHotel được cung cấp dữ liệu cá nhân của Bên Cung Cấp cho bất kỳ hoặc đồng thời các chủ thể sau (do PHHotel quyết định trong từng trường hợp cụ thể, phù hợp với thỏa thuận tại Khoản này) và các chủ thể này được quyền xử lý dữ liệu cá nhân của Bên Cung Cấp mà không cần thêm bất kỳ sự đồng ý, xác nhận nào khác của Bên Cung Cấp (trừ trường hợp PHHotel có yêu cầu khác): (i) PHHotel; (ii) các công ty và/hoặc các tổ chức, cá nhân là các bên cung cấp dịch vụ, đại lý, đối tác, nhà thầu, liên kết với PHHotel và/hoặc các cố vấn, tư vấn chuyên nghiệp của PHHotel; (iii) các cơ quan có thẩm quyền ở Việt Nam, tổ chức hay người yêu cầu cung cấp thông tin theo quy định pháp luật Việt Nam, (iv) Bên nhận chuyển nhượng trong trường hợp sáp nhập, thoái vốn, tái cơ cấu, tổ chức lại, giải thể hoặc bán hoặc chuyển nhượng một phần hoặc toàn bộ tài sản PHHotel, cho dù là một hoạt động liên tục hoặc là một phần của phá sản, thanh lý, thủ tục tương tự; (iv) Các bên liên quan khác mà PHHotel thấy là cần thiết để phục vụ hoạt động nhân sự, đáp ứng sản phẩm/dịch vụ, bảo vệ quyền và lợi ích hợp pháp của PHHotel, của Bên Cung Cấp theo Hợp đồng hoặc PHHotel đánh giá là có cơ sở pháp lý để cung cấp dữ liệu cá nhân của Bên Cung Cấp.',
            ],
          },
          {
            h3: '6.',
            p: [
              'Bên Cung Cấp đồng ý rằng Dữ liệu cá nhân của Bên Cung Cấp được xử lý bằng bất kỳ phương thức nào theo chính sách của PHHotel trong từng thời kỳ tùy thuộc vào từng Mục Đích, bao gồm nhưng không giới hạn, thu thập, ghi, phân tích, xác nhận, lưu trữ, chỉnh sửa, kết hợp, truy cập, truy xuất, thu hồi, mã hóa, giải mã, sao chép, chia sẻ, truyền đưa, cung cấp, chuyển giao, sử dụng không gian mạng, thiết bị, phương tiện điện tử hoặc các hình thức khác để chuyển Dữ liệu cá nhân trong nước và/hoặc ra nước ngoài, xóa, hủy và các hành động khác có liên quan.',
            ],
          },
          {
            h3: '7.',
            p: [
              'Bên Cung Cấp đồng ý rằng Dữ liệu cá nhân có thể được chuyển giao, lưu trữ, xử lý tại nơi các máy chủ của PHHotel, vị trí và cơ sở dữ liệu trung tâm của PHHotel được điều hành hoặc sẽ được truyền đến Hoa Kỳ nơi Google đặt máy chủ (do trang web của PHHotel sử dụng Google Analytics của Google).',
            ],
          },
          {
            h3: '8.',
            p: [
              'Bên Cung Cấp hiểu và đồng ý rằng việc Bên Cung Cấp thực hiện các quyền quy định tại Điều 3 bản Chấp Thuận này có thể dẫn đến hệ quả các nghĩa vụ mà Bên Cung Cấp phải đáp ứng theo các Hợp đồng giữa Bên Cung Cấp và PHHotel không còn phù hợp/ảnh hưởng đến quyền lợi của PHHotel theo đánh giá của PHHotel, Bên Cung Cấp đồng ý việc PHHotel được chủ động lựa chọn thực hiện một trong các cách thức sau mà Bên Cung Cấp không có bất kỳ phản đối nào: (i) Ngừng thực hiện/Chấm dứt hiệu lực của các Hợp đồng giữa Bên Cung Cấp và PHHotel mà không chịu bất kỳ trách nhiệm nào; (ii) Đồng ý thực hiện theo yêu cầu của Bên Cung Cấp; (iii) Yêu cầu Bên Cung Cấp rút lại các yêu cầu này.',
            ],
          },
        ],
      },
      {
        title: 'Điều 3. Quyền và nghĩa vụ của Bên Cung Cấp về xử lý Dữ liệu cá nhân',
        blocks: [
          {
            h3: '1.',
            p: [
              'Bên Cung Cấp có quyền được biết, đồng ý, cung cấp, truy cập, chỉnh sửa, xóa Dữ liệu cá nhân, rút lại sự đồng ý về việc xử lý Dữ liệu cá nhân, yêu cầu hạn chế hoặc phản đối xử lý Dữ liệu cá nhân của mình, quyền khiếu nại, tố cáo, khởi kiện, quyền yêu cầu bồi thường thiệt hại và quyền tự bảo vệ, trừ trường hợp pháp luật có quy định khác. Việc rút lại sự đồng ý sẽ không ảnh hướng đến tính hợp pháp của việc xử lý dữ liệu đã được đồng ý trước khi rút lại sự đồng ý.',
            ],
          },
          {
            h3: '2.',
            p: [
              'Bên Cung Cấp có thể thực hiện các quyền trên của mình bằng cách gửi văn bản có chữ ký hợp pháp qua đường bưu điện đến địa chỉ trụ sở chính của PHHotel, hoặc gửi thư điện tử đến địa chỉ hotro@phhotel.vn.',
            ],
          },
          {
            h3: '3.',
            p: [
              'Tự bảo vệ Dữ liệu cá nhân của mình; yêu cầu các tổ chức, cá nhân khác có liên quan bảo vệ Dữ liệu cá nhân của mình.',
            ],
          },
          {
            h3: '4.',
            p: ['Tôn trọng, bảo vệ dữ liệu cá nhân của người khác.'],
          },
          {
            h3: '5.',
            p: [
              'Bên Cung Cấp có trách nhiệm cung cấp cho PHHotel Dữ liệu cá nhân hợp pháp, đầy đủ, chính xác và đã được cập nhật vào thời điểm cung cấp.',
            ],
          },
          {
            h3: '6.',
            p: [
              'Các hướng dẫn của Bên Cung Cấp về việc xử lý Dữ liệu cá nhân sẽ phù hợp với nội dung Hợp đồng và tuân theo tất cả các Luật về bảo vệ dữ liệu, bao gồm cả việc chỉ định PHHotel làm bên xử lý khác, đã được ủy quyền bởi bên kiểm soát có liên quan. Bên Cung Cấp chịu trách nhiệm về tính hợp pháp của Dữ liệu cá nhân và phương thức mà Bên Cung Cấp nhận được Dữ liệu cá nhân. PHHotel sẽ không bắt buộc phải tuân thủ hoặc tuân theo hướng dẫn của Bên Cung Cấp nếu những hướng dẫn đó vi phạm Luật bảo vệ dữ liệu',
            ],
          },
          {
            h3: '7.',
            p: [
              'Bên Cung Cấp có các quyền và nghĩa vụ khác theo quy định của pháp luật.',
            ],
          },
        ],
      },
      {
        title: 'Điều 4. Cam kết khác về xử lý Dữ liệu cá nhân',
        blocks: [
          {
            p: [
              'Trong quá trình xử lý Dữ liệu cá nhân, PHHotel và các bên liên quan cam kết sẽ áp dụng các biện pháp kỹ thuật, an ninh, bảo mật cần thiết và trong khả năng phù hợp để bảo vệ Dữ liệu cá nhân của Bên Cung Cấp theo quy định pháp luật Việt Nam; tuân thủ đầy đủ theo Thỏa thuận bảo vệ Dữ liệu cá nhân này và các Hợp đồng với Bên Cung Cấp. Tuy nhiên, Bên Cung Cấp hiểu và công nhận rằng không có hệ thống kỹ thuật hay biện pháp an ninh, bảo mật nào là an toàn tuyệt đối và giao dịch trực tuyến, không gian mạng cùng các hình thức xử lý Dữ liệu cá nhân luôn tiềm ẩn các nguy cơ phát sinh, bao gồm nhưng không giới hạn, việc dữ liệu bị rò rỉ, phát tán, lợi dụng, chiếm đoạt hoặc sử dụng sai cách. Bên Cung Cấp miễn trừ cho PHHotel mọi nghĩa vụ và trách nhiệm về các rủi ro có thể xảy ra trong quá trình xử lý dữ liệu cá nhân do các nguyên nhân khách quan ngoài tầm kiểm soát của PHHotel.',
            ],
          },
        ],
      },
      {
        title: 'Điều 5. Thời gian bắt đầu và kết thúc xử lý Dữ liệu cá nhân',
        blocks: [
          {
            p: [
              'PHHotel bắt đầu thực hiện các hoạt động xử lý Dữ liệu cá nhân từ khi được cung cấp và/hoặc biết được cho đến khi (i) Hợp đồng với Bên Cung Cấp hết hiệu lực, hoặc (ii) Mục Đích xử lý Dữ liệu đã hoàn thành hoặc không còn cần thiết, hoặc (iii) nhận được yêu cầu kết thúc xử lý dữ liệu bằng văn bản của cơ quan nhà nước có thẩm quyền, hoặc (iv) Bên Cung Cấp có quyết định rút lại sự đồng ý sau khi Bên Cung Cấp đã hoàn tất các thủ tục theo quy định của pháp luật, và/hoặc (v) chính sách áp dụng tại từng thời điểm của PHHotel.',
            ],
          },
        ],
      },
      {
        title: 'Điều 6. Tuyên bố của Bên Cung Cấp',
        blocks: [
          {
            h3: '1.',
            p: [
              'Bên Cung Cấp tự nguyện đồng ý và hiểu rõ các nội dung quy định tại từng Điều khoản của bản Thỏa thuận này.',
            ],
          },
          {
            h3: '2.',
            p: [
              'Trường hợp Bên Cung Cấp không phải chủ thể dữ liệu, Bên Cung Cấp đảm bảo:',
            ],
            ul: [
              'Bên Cung Cấp đã nhận được sự đồng ý rõ ràng (theo quy định Luật bảo vệ dữ liệu) của chủ thể dữ liệu đối với mọi hoạt động thu thập, sử dụng dữ liệu và cung cấp thông tin cho PHHotel;',
              'Bên Cung Cấp đã thông báo và nhận được sự đồng ý rõ ràng (theo quy định Luật bảo vệ dữ liệu) của chủ thể dữ liệu về việc Dữ liệu cá nhân có thể được xử lý bên ngoài quốc gia ban đầu của họ',
              'Chủ thể dữ liệu đã biết rõ và đồng ý toàn bộ với hoạt động xử lý Dữ liệu cá nhân và nội dung quy định tại Điều 2 bản Thỏa thuận này trước khi đồng ý cho Bên Cung Cấp tiến hành thu thập Dữ liệu cá nhân, phù hợp với các quy định tại bản Thỏa thuận này và Luật bảo vệ dữ liệu;',
              'Lưu trữ các bằng chứng chứng minh sự đồng ý của chủ thể dữ liệu theo quy định tại Khoản này và cung cấp bằng chứng này theo yêu cầu của PHHotel.',
            ],
          },
          {
            h3: '3.',
            p: [
              'Bên cung cấp đảm bảo và bồi thường cho PHHotel các thiệt hại do Bên Cung Cấp không thực hiện theo đúng quy định tại Điều này.',
            ],
          },
        ],
      },
      {
        title: 'Điều 7: Điều khoản chung',
        blocks: [
          {
            h3: '1.',
            p: [
              'Bản Thỏa thuận này là một phần không thể tách rời với Hợp đồng đã ký giữa Bên Cung Cấp và PHHotel.',
            ],
          },
          {
            h3: '2.',
            p: [
              'Trong trường hợp PHHotel có cung cấp các Dữ liệu cá nhân mà PHHotel thu thập/nắm giữ cho Bên Cung Cấp, thì Bên Cung Cấp cam kết sẽ tuân thủ mức độ bảo vệ Dữ liệu cá nhân không thấp hơn mức độ bảo vệ mà PHHotel đã cam kết tại văn bản này.',
            ],
          },
          {
            h3: '3.',
            p: [
              'Bên Cung Cấp đồng ý PHHotel có quyền điều chỉnh, sửa đổi, bổ sung, thay thế các nội dung của Thỏa thuận xử lý dữ liệu cá nhân và công bố hoặc thông báo theo hình thức công khai như sau: Công bố, thông báo trên website: phhotel.vn; và/hoặc công bố, thông báo bằng văn bản hoặc email hoặc dưới bất cứ hình thức nào khác mà PHHotel cho là phù hợp. Bên Cung Cấp chịu trách nhiệm cập nhật các bản Thỏa thuận xử lý dữ liệu cá nhân từ các kênh công bố, kênh thông báo của PHHotel như quy định tại khoản này và các bản Thỏa thuận điều chỉnh, sửa đổi, bổ sung, thay thế này có giá trị pháp lý áp dụng như khi được thể hiện dưới hình thức văn bản giấy, theo đó, Bên Cung Cấp và PHHotel có trách nhiệm thực hiện mà không cần phải tiến hành lập, giao kết thêm dưới hình thức văn bản giấy.',
              'Các bản Thỏa thuận xử lý dữ liệu cá nhân được điều chỉnh, sửa đổi, bổ sung, thay thế có hiệu lực vào thời điểm theo thông tin được công bố, thông báo khi PHHotel công bố, thông báo như quy định tại Khoản này. Trường hợp Bên Cung Cấp không đồng ý với những nội dung thay đổi, Bên Cung Cấp phải gửi văn bản thông báo đến PHHotel.',
            ],
          },
          {
            h3: '4.',
            p: [
              'Trong trường hợp có bất kỳ xung đột hoặc mâu thuẫn nào về bảo vệ và xử lý dữ liệu cá nhân giữa Thỏa thuận này với các Hợp đồng được giao kết/xác lập trước, vào ngày hoặc sau ngày Bên Cung Cấp chấp thuận Thỏa thuận này, bản Thỏa thuận này sẽ được ưu tiên áp dụng.',
            ],
          },
          {
            h3: '5.',
            p: [
              'Bên Cung Cấp hiểu rõ và đồng ý rằng bản Thỏa thuận này đồng thời là thông báo của PHHotel về việc xử lý Dữ liệu cá nhân của Bên Cung Cấp và PHHotel không cần gửi thêm bất kỳ thông báo nào khác cho Bên Cung Cấp liên quan đến việc xử lý thông tin này.',
            ],
          },
          {
            h3: '6.',
            p: [
              'Bản Thỏa thuận này sẽ có hiệu lực từ ngày ký cho đến khi bị chấm dứt theo Điều 5.',
            ],
          },
          {
            h3: '7.',
            p: [
              'Bản Thỏa thuận này được giải thích và điều chỉnh theo quy định pháp luật Việt Nam. Trường hợp có các tranh chấp phát sinh và/hoặc liên quan đến bản Thỏa thuận này thì các tranh chấp đó sẽ được giải quyết tại Tòa án nhân dân có thẩm quyền.',
            ],
          },
        ],
      },
      {
        title: '',
        blocks: [
          {
            strongP: 'BÊN CUNG CẤP',
          },
        ],
      },
    ],
  },
  en: {
    title: 'PERSONAL DATA PROTECTION AND PROCESSING CONSENT AGREEMENT',
    lastUpdatedLabel: 'Last updated',
    subtitle:
      '(Pursuant to Government Decree No. 13/2023/ND-CP on Personal Data Protection, effective from 1 July 2023)',
    sections: [
      {
        title: '',
        blocks: [
          {
            p: ['This Agreement is made and signed on …/…/… by:'],
          },
          {
            strongP: 'Full name:',
          },
          {
            p: [
              'ID card/Citizen ID/Passport No.: …………………… date of issue …………………… place of issue ………..',
            ],
          },
          {
            strongP: 'Permanent address:',
          },
          {
            p: ['………………………………………………………………………………'],
          },
          {
            strongP: 'Phone number:',
          },
          {
            p: ['……………………………………………………………………………………..'],
          },
          {
            p: ['(hereinafter referred to as the "Provider")'],
          },
          {
            p: [
              'The Provider voluntarily agrees to comply with the regulations on personal data protection on the following terms:',
            ],
          },
        ],
      },
      {
        title: 'Article 1: Definitions',
        blocks: [
          {
            p: [
              '"Contract" means collectively the contracts between the Provider and PHHotel and/or minutes, agreements, appendices, and documents relating to such contracts. These may include employment contracts, probation contracts, and other contracts.',
            ],
          },
          {
            p: [
              '"Personal Data" means information in the form of symbols, writing, numbers, images, sounds, or similar forms in the electronic environment that is associated with or helps identify a specific individual. Personal Data referred to in this Agreement means Personal Data of any data subject that PHHotel obtains from the Provider, which may be Personal Data of the Provider itself, or Personal Data of other data subjects that the Provider has lawfully collected and is authorized to transfer or provide to PHHotel so that PHHotel may perform the work stated in the contract(s) between PHHotel and the Provider.',
            ],
          },
          {
            p: [
              '"Data Protection Law" means all laws and regulations on the protection of Personal Data or privacy applicable to the processing of Personal Data in Vietnam, including but not limited to the Law on National Security 2004, the Law on Cybersecurity 2018, Decree No. 13/2023/ND-CP on personal data protection, and any amendments, supplements, or replacements thereof.',
            ],
          },
          {
            p: [
              '"PHHotel" includes PHHotel employees, branches/parent companies/subsidiaries, and related companies of PHHotel.',
            ],
          },
          {
            p: [
              '"HR Activities" means human resources work and activities that PHHotel performs in relation to the Provider, including but not limited to recruitment; signing and performing probation contracts; signing and performing employment contracts; paying salaries, bonuses, allowances, and benefits; training; appointment; transfer; dismissal; commendation; discipline; suspension; termination of employment contracts; and other HR-related work and activities.',
            ],
          },
          {
            p: [
              'The terms "Personal Data", "data subject", "processing of Personal Data", "data controller", and "data controller and processor" used in this Agreement have the meanings prescribed in Decree No. 13/2023/ND-CP on personal data protection and any amendments or supplements thereto (if any).',
            ],
          },
        ],
      },
      {
        title: 'Article 2. Scope of Consent',
        blocks: [
          {
            h3: '1.',
            p: [
              'The parties acknowledge and agree that: (i) PHHotel is the Data Controller, Data Processor, or Data Controller and Processor, as the case may be; (ii) the Provider is the data subject, Data Controller, or Data Controller and Processor, as the case may be; and (iii) each party shall comply with its obligations under applicable Data Protection Law in relation to the processing of Personal Data.',
            ],
          },
          {
            h3: '2.',
            p: [
              'The Provider confirms and agrees that PHHotel is permitted to collect the Provider\'s Personal Data (directly or indirectly) from various data sources, including but not limited to: (i) information provided by the Provider (verbally or in writing) during recruitment, when entering into a Contract, during employment at PHHotel, or through survey programs in which the Provider participates; (ii) state agencies, suppliers, service providers, PHHotel partners, and other third parties, including but not limited to HR service consultants, banks, credit institutions, employment organizations, the Provider\'s relatives, etc.; (iii) publicly available information sources; (iv) files created by websites accessed by the Provider (cookies) or similar monitoring devices/tools.',
              'The Provider may refer to https://phhotel.vn/terms-of-service to better understand how information is collected on PHHotel\'s website.',
            ],
          },
          {
            h3: '3.',
            p: [
              'The Provider agrees that PHHotel may process the Provider\'s Personal Data, including basic personal data and sensitive personal data, and data updated, amended, or supplemented from time to time, including:',
            ],
          },
          {
            strongP:
              'Basic personal data includes full name, date of birth, gender, place of birth, permanent address, contact address, nationality, photographs, phone number, email, national ID/citizen ID/passport/other identification documents, family relationship information, account numbers, Personal Data reflecting activities and activity history in cyberspace, and other information or data associated with or helping identify a specific individual, and other information or data as prescribed by law; and',
          },
          {
            strongP:
              'Sensitive personal data includes health and private life status, race, ethnicity, genetic characteristics, physical attributes, biometric information (fingerprints), employment status, criminal data, criminal behavior, customer information of credit institutions, foreign bank branches, payment intermediary service providers, and other authorized organizations, including account information, deposit information, entrusted asset information, transaction information, information about organizations or individuals acting as guarantors at credit institutions, bank branches, or payment intermediary service providers; location data of an individual determined through positioning services; and other data prescribed by law as special and requiring necessary security measures',
          },
          {
            h3: '4.',
            p: [
              'The Provider agrees and confirms that the Provider\'s Personal Data will be processed for one or more of the following Purposes:',
            ],
            ul: [
              'To authenticate and identify the Provider, and to evaluate and assess for the purpose of entering into a Contract;',
              'To support PHHotel\'s provision, operation, processing, and management of HR activities relating to the Provider, and for other purposes that PHHotel determines to be appropriate from time to time;',
              'To perform and comply with the Contract entered into with the Provider and to carry out HR activities toward the Provider;',
              'To serve inspections by the State Bank, educational institutions, enterprises, or other relevant agencies (if necessary);',
              'To evaluate and/or process the Provider\'s requests/proposals relating to any HR activity (including but not limited to third-party products such as insurance and healthcare policies);',
              'To provide/send information and documents relating to HR activities and work under the Contract to the Provider;',
              'To enter and verify the completeness and accuracy of data entered by the Provider into the system',
              'To conduct satisfaction surveys and polls to improve the quality of HR activities;',
              'To receive and contact the Provider to answer questions and handle requests and complaints;',
              'To exercise control, protect PHHotel\'s rights, manage risk, prevent and investigate fraud, unlawful activity, omissions, or misconduct, resolve disputes, and conduct litigation;',
              'To ensure public security and occupational safety, and to protect personal safety, rights, property, or safety of others;',
              'To implement regulations relating to protection of PHHotel\'s system security and protection of the Provider\'s personal data;',
              'To collect statistical data and conduct internal research and reporting as required by law and/or record retention requirements;',
              'To serve PHHotel\'s audit, risk management, and compliance activities;',
              'To meet or comply with PHHotel\'s internal policies and legal obligations, or at the request of competent state authorities;',
              'To perform other purposes relating to PHHotel\'s business, operations, management, and compliance in accordance with applicable law from time to time.',
            ],
            p: [
              'Some Purposes for collecting, using, disclosing, or processing personal data depend on the circumstances at the time of collection and therefore may not appear in the list above. However, PHHotel will notify the Provider of such Purposes when the Provider\'s consent is required, unless processing without the data subject\'s consent is permitted by law.',
            ],
          },
          {
            h3: '5.',
            p: [
              'To achieve the personal data processing purposes specified in Clause 3 of this Article, the Provider consents to, permits representation of, and authorizes PHHotel to provide the Provider\'s personal data to any or all of the following entities (as PHHotel decides in each specific case, consistent with this Clause), and such entities are authorized to process the Provider\'s personal data without any further consent or confirmation from the Provider (unless PHHotel requires otherwise): (i) PHHotel; (ii) companies and/or organizations or individuals that are service providers, agents, partners, contractors, affiliates of PHHotel and/or PHHotel\'s professional advisors or consultants; (iii) competent authorities in Vietnam, or organizations or persons requesting information under Vietnamese law; (iv) a transferee in the event of merger, divestiture, restructuring, reorganization, dissolution, or sale or transfer of part or all of PHHotel\'s assets, whether as a going concern or as part of bankruptcy, liquidation, or similar proceedings; (iv) other relevant parties that PHHotel considers necessary to serve HR activities, deliver products/services, protect the lawful rights and interests of PHHotel or the Provider under the Contract, or where PHHotel assesses that there is a legal basis to provide the Provider\'s personal data.',
            ],
          },
          {
            h3: '6.',
            p: [
              'The Provider agrees that the Provider\'s Personal Data may be processed by any method under PHHotel\'s policies from time to time depending on each Purpose, including but not limited to collecting, recording, analyzing, confirming, storing, editing, combining, accessing, retrieving, recovering, encrypting, decrypting, copying, sharing, transmitting, providing, transferring, using cyberspace, devices, electronic means, or other forms to transfer Personal Data domestically and/or abroad, deleting, destroying, and other related actions.',
            ],
          },
          {
            h3: '7.',
            p: [
              'The Provider agrees that Personal Data may be transferred, stored, and processed at PHHotel\'s servers, locations, and central databases operated by PHHotel, or transmitted to the United States where Google hosts servers (because PHHotel\'s website uses Google Analytics).',
            ],
          },
          {
            h3: '8.',
            p: [
              'The Provider understands and agrees that if the Provider exercises the rights specified in Article 3 of this Consent, the resulting consequences may mean that obligations the Provider must fulfill under the Contracts between the Provider and PHHotel are no longer suitable or affect PHHotel\'s interests as assessed by PHHotel. The Provider agrees that PHHotel may proactively choose one of the following measures without any objection from the Provider: (i) suspend performance/terminate the Contracts between the Provider and PHHotel without incurring any liability; (ii) agree to perform according to the Provider\'s request; (iii) request the Provider to withdraw such requests.',
            ],
          },
        ],
      },
      {
        title:
          'Article 3. Rights and Obligations of the Provider Regarding Processing of Personal Data',
        blocks: [
          {
            h3: '1.',
            p: [
              'The Provider has the right to be informed, to consent, to provide, to access, to correct, and to delete Personal Data; to withdraw consent to the processing of Personal Data; to request restriction of or object to processing of Personal Data; the rights to complain, denounce, initiate lawsuits, claim compensation for damage, and self-protection, except where otherwise provided by law. Withdrawal of consent shall not affect the lawfulness of processing based on consent before withdrawal.',
            ],
          },
          {
            h3: '2.',
            p: [
              'The Provider may exercise the above rights by sending a legally signed document by post to PHHotel\'s head office, or by email to hotro@phhotel.vn.',
            ],
          },
          {
            h3: '3.',
            p: [
              'To protect the Provider\'s own Personal Data and to request relevant organizations and individuals to protect the Provider\'s Personal Data.',
            ],
          },
          {
            h3: '4.',
            p: ['To respect and protect the personal data of others.'],
          },
          {
            h3: '5.',
            p: [
              'The Provider is responsible for providing PHHotel with Personal Data that is lawful, complete, accurate, and up to date at the time of provision.',
            ],
          },
          {
            h3: '6.',
            p: [
              'The Provider\'s instructions regarding the processing of Personal Data shall be consistent with the Contract and comply with all Data Protection Laws, including designating PHHotel as another processor authorized by the relevant controller. The Provider is responsible for the lawfulness of the Personal Data and the manner in which the Provider obtained the Personal Data. PHHotel is not obliged to comply with or follow the Provider\'s instructions if such instructions violate Data Protection Law.',
            ],
          },
          {
            h3: '7.',
            p: [
              'The Provider has other rights and obligations as prescribed by law.',
            ],
          },
        ],
      },
      {
        title: 'Article 4. Other Commitments on Processing of Personal Data',
        blocks: [
          {
            p: [
              'During the processing of Personal Data, PHHotel and relevant parties commit to applying necessary and appropriate technical, security, and confidentiality measures within their capability to protect the Provider\'s Personal Data in accordance with Vietnamese law; and to fully comply with this Personal Data Protection Agreement and the Contracts with the Provider. However, the Provider understands and acknowledges that no technical system or security/confidentiality measure is absolutely safe, and online transactions, cyberspace, and forms of Personal Data processing always carry inherent risks, including but not limited to leakage, dissemination, misuse, misappropriation, or improper use of data. The Provider releases PHHotel from all obligations and liability for risks that may arise during personal data processing due to objective causes beyond PHHotel\'s control.',
            ],
          },
        ],
      },
      {
        title: 'Article 5. Start and End of Personal Data Processing',
        blocks: [
          {
            p: [
              'PHHotel begins processing Personal Data from the time it is provided and/or becomes known until: (i) the Contract with the Provider expires; (ii) the Purpose of processing has been completed or is no longer necessary; (iii) a written request to end processing is received from a competent state authority; (iv) the Provider decides to withdraw consent after completing procedures prescribed by law; and/or (v) PHHotel\'s applicable policies from time to time.',
            ],
          },
        ],
      },
      {
        title: 'Article 6. Provider\'s Representations',
        blocks: [
          {
            h3: '1.',
            p: [
              'The Provider voluntarily agrees to and clearly understands the contents specified in each Article of this Agreement.',
            ],
          },
          {
            h3: '2.',
            p: [
              'If the Provider is not the data subject, the Provider warrants that:',
            ],
            ul: [
              'The Provider has obtained clear consent (under Data Protection Law) from the data subject for all activities of collecting, using data, and providing information to PHHotel;',
              'The Provider has notified and obtained clear consent (under Data Protection Law) from the data subject that Personal Data may be processed outside their country of origin',
              'The data subject has fully understood and agreed to the processing of Personal Data and the contents specified in Article 2 of this Agreement before consenting to the Provider\'s collection of Personal Data, in accordance with this Agreement and Data Protection Law;',
              'Evidence proving the data subject\'s consent under this Clause is retained and will be provided to PHHotel upon request.',
            ],
          },
          {
            h3: '3.',
            p: [
              'The Provider warrants and indemnifies PHHotel for damages arising from the Provider\'s failure to comply with this Article.',
            ],
          },
        ],
      },
      {
        title: 'Article 7: General Provisions',
        blocks: [
          {
            h3: '1.',
            p: [
              'This Agreement is an integral and inseparable part of the Contract signed between the Provider and PHHotel.',
            ],
          },
          {
            h3: '2.',
            p: [
              'If PHHotel provides Personal Data that PHHotel has collected/retained to the Provider, the Provider commits to comply with a level of Personal Data protection no lower than the level of protection PHHotel has committed to in this document.',
            ],
          },
          {
            h3: '3.',
            p: [
              'The Provider agrees that PHHotel has the right to adjust, amend, supplement, or replace the contents of this personal data processing agreement and to publish or notify them publicly as follows: publication or notification on the website phhotel.vn; and/or publication or notification in writing, by email, or in any other form PHHotel deems appropriate. The Provider is responsible for updating personal data processing agreements from PHHotel\'s publication and notification channels as specified in this Clause, and such adjusted, amended, supplemented, or replaced agreements have legal effect as if expressed in paper form, whereby the Provider and PHHotel shall perform them without needing to execute additional paper documents.',
              'Adjusted, amended, supplemented, or replaced personal data processing agreements take effect at the time stated in PHHotel\'s publication or notification as specified in this Clause. If the Provider does not agree with the changed contents, the Provider must send written notice to PHHotel.',
            ],
          },
          {
            h3: '4.',
            p: [
              'In the event of any conflict or inconsistency regarding the protection and processing of personal data between this Agreement and Contracts entered into or established before, on, or after the date the Provider accepts this Agreement, this Agreement shall prevail.',
            ],
          },
          {
            h3: '5.',
            p: [
              'The Provider clearly understands and agrees that this Agreement also serves as PHHotel\'s notice regarding the processing of the Provider\'s Personal Data, and PHHotel does not need to send any additional notice to the Provider relating to such processing.',
            ],
          },
          {
            h3: '6.',
            p: [
              'This Agreement takes effect from the date of signing until terminated under Article 5.',
            ],
          },
          {
            h3: '7.',
            p: [
              'This Agreement shall be interpreted and governed by the laws of Vietnam. Any disputes arising from and/or relating to this Agreement shall be resolved at a competent People\'s Court.',
            ],
          },
        ],
      },
      {
        title: '',
        blocks: [
          {
            strongP: 'PROVIDER',
          },
        ],
      },
    ],
  },
};
