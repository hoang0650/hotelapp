import { Component, Input, OnInit, Inject } from '@angular/core';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';

// Khai báo để TypeScript biết về biến toàn cục pdfMake
declare global {
  interface Window {
    pdfMake: any;
    pdfMake_vfs: any;
  }
}

// Interface cho các mục trong hóa đơn
interface InvoiceProduct {
  name: string;
  price: number;
  quantity?: number;
}

// Interface cho dữ liệu duration
interface Duration {
  hours: number;
  days: number;
}

// Interface cho dịch vụ
interface Service {
  name: string;
  price: number;
  quantity?: number;
}

// Interface cho dữ liệu hóa đơn
interface InvoiceData {
  invoiceNumber: string;
  date: Date | string;
  businessName?: string;
  business_address?: string;
  phoneNumber?: string;
  staffName?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  roomNumber?: string;
  roomType?: string;
  roomRate?: number;
  checkInTime?: Date | string;
  checkOutTime?: Date | string;
  products: InvoiceProduct[];
  services?: Service[];
  additionalCharges?: number;
  discount?: number;
  advancePayment?: number;
  totalAmount: number;
  roomTotal?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  duration?: Duration;
  notes?: string;
  staffId?: string;
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  [key: string]: any; // Cho phép có các trường khác
}

@Component({
  selector: 'app-invoice',
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent implements OnInit {
  invoiceData: InvoiceData;
  businessInfo: any;
  isLoading: boolean = false;
  
  today: Date = new Date();
  
  // Các trường tính toán mới
  subtotal: number = 0; // Tổng tiền hàng (products)
  serviceTotal: number = 0; // Tổng tiền dịch vụ
  finalTotalAmount: number = 0; // Tổng tiền cuối cùng phải trả
  
  // Thêm các trường tính toán
  get totalWithoutDiscount(): number {
    return this.subtotal + (this.invoiceData?.additionalCharges || 0);
  }
  
  get durationText(): string {
    if (!this.invoiceData.duration) {
      return 'N/A';
    }
    
    const hours = this.invoiceData.duration.hours || 0;
    const days = this.invoiceData.duration.days || 0;
    
    if (days >= 1) {
      return `${days} ngày ${hours % 24 > 0 ? `${hours % 24} giờ` : ''}`;
    } else {
      return `${hours} giờ`;
    }
  }

  // Getter kiểm tra services có tồn tại và có phần tử không
  get hasServices(): boolean {
    return !!this.invoiceData.services && this.invoiceData.services.length > 0;
  }

  constructor(
    @Inject(NZ_MODAL_DATA) private data: { invoiceData: InvoiceData, businessInfo: any }
  ) {
    this.invoiceData = data.invoiceData || {
      invoiceNumber: '',
      date: new Date(),
      products: [],
      services: [],
      totalAmount: 0 // Giá trị này có thể sẽ bị ghi đè
    };
    this.businessInfo = data.businessInfo;
  }

  ngOnInit(): void {
    console.log('Invoice data received via NZ_MODAL_DATA:', this.invoiceData);
    console.log('Business info received via NZ_MODAL_DATA:', this.businessInfo);
    
    // Đảm bảo rằng products luôn là một mảng
    if (!this.invoiceData.products || !Array.isArray(this.invoiceData.products)) {
      this.invoiceData.products = [];
    }
    
    // Đảm bảo rằng services luôn là một mảng
    if (!this.invoiceData.services || !Array.isArray(this.invoiceData.services)) {
      this.invoiceData.services = [];
    }
    
    // Đảm bảo rằng tất cả các trường cần thiết tồn tại
    this.invoiceData = {
      ...this.invoiceData,
      additionalCharges: this.invoiceData.additionalCharges || 0,
      discount: this.invoiceData.discount || 0,
      advancePayment: this.invoiceData.advancePayment || 0,
      paymentStatus: this.invoiceData.paymentStatus || 'paid'
    };
    
    // Tính toán các giá trị
    this.subtotal = this.calculateSubtotal();
    this.serviceTotal = this.calculateServiceTotal();
    this.calculateFinalTotal();
    
    // Tự động thêm dịch vụ vào danh sách sản phẩm nếu chưa có
    if (this.invoiceData.services && this.invoiceData.services.length > 0 && 
        this.invoiceData.products.length === 1) {
      this.invoiceData.services.forEach(service => {
        this.invoiceData.products.push({
          name: service.name,
          price: service.price,
          quantity: service.quantity
        });
      });
    }
    
    // Tính tổng thời gian lưu trú nếu chưa có
    if (!this.invoiceData.duration && this.invoiceData.checkInTime && this.invoiceData.checkOutTime) {
      const checkInTime = new Date(this.invoiceData.checkInTime);
      const checkOutTime = new Date(this.invoiceData.checkOutTime);
      const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
      
      this.invoiceData.duration = {
        hours: durationInHours,
        days: Math.ceil(durationInHours / 24)
      };
    }
    console.log('Calculated Subtotal:', this.subtotal);
    console.log('Calculated Service Total:', this.serviceTotal);
    console.log('Calculated Final Total:', this.finalTotalAmount);
  }
  
  // Tính tổng tiền hàng (chỉ products)
  calculateSubtotal(): number {
    if (!this.invoiceData.products) {
      return 0;
    }
    return this.invoiceData.products.reduce((total: number, item: InvoiceProduct) => {
      const price = item.price || 0;
      const quantity = item.quantity || 1;
      // KHÔNG cộng/trừ charges/discount ở đây nữa
      return total + (price * quantity);
    }, 0);
  }
  
  // Tính tổng tiền dịch vụ (loại bỏ các dịch vụ trùng với products)
  calculateServiceTotal(): number {
    if (!this.invoiceData.services) {
      return 0;
    }
    return this.invoiceData.services.reduce((total: number, service: Service) => {
      // Kiểm tra xem dịch vụ này có vẻ đã nằm trong products chưa
      if (this.isServiceInProducts(service)) {
        return total; // Bỏ qua nếu đã có trong products
      }
      const price = service.price || 0;
      const quantity = service.quantity || 1;
      return total + (price * quantity);
    }, 0);
  }
  
  // Tính tổng tiền cuối cùng
  calculateFinalTotal(): void {
      // Bắt đầu với tổng sản phẩm và dịch vụ
      let currentTotal = this.subtotal + this.serviceTotal;
      
      // Cộng phụ thu
      currentTotal += this.invoiceData.additionalCharges || 0;
      
      // Trừ giảm giá
      currentTotal -= this.invoiceData.discount || 0;
      
      // Trừ tiền trả trước
      currentTotal -= this.invoiceData.advancePayment || 0;
      
      // Đảm bảo không âm
      this.finalTotalAmount = Math.max(0, currentTotal);
  }

  // Định dạng tiền tệ
  formatCurrency(amount: number | undefined): string {
    if (amount === undefined || amount === null) return '0 đ';
    return amount.toLocaleString('vi-VN') + ' đ';
  }

  // Lấy nhãn phương thức thanh toán
  getPaymentMethodLabel(method: string | undefined): string {
    if (!method) return 'Tiền mặt';
    const paymentMethods: { [key: string]: string } = {
      'cash': 'Tiền mặt',
      'card': 'Thẻ tín dụng',
      'banking': 'Chuyển khoản',
      'qr': 'QR Code',
      'visa': 'Thẻ VISA',
      'momo': 'Ví MoMo',
      'zalopay': 'ZaloPay',
      'vnpay': 'VNPay'
    };
    return paymentMethods[method.toLowerCase()] || method;
  }
  
  // Lấy nhãn trạng thái thanh toán
  getPaymentStatusLabel(status: string | undefined): string {
    if (!status) return 'Đã thanh toán';
    const statusLabels: { [key: string]: string } = {
      'paid': 'Đã thanh toán',
      'pending': 'Chưa thanh toán',
      'partial': 'Thanh toán một phần',
      'included_in_room_charge': 'Đã tính vào tiền phòng'
    };
    return statusLabels[status.toLowerCase()] || status;
  }
  
  // Lấy màu sắc cho phương thức thanh toán
  getPaymentMethodColor(method: string | undefined): string {
    if (!method) return 'green';
    const colorMap: { [key: string]: string } = {
      'cash': 'green',
      'card': 'blue',
      'banking': 'purple',
      'qr': 'cyan',
      'visa': 'geekblue',
      'momo': 'magenta',
      'zalopay': 'blue',
      'vnpay': 'orange'
    };
    return colorMap[method.toLowerCase()] || 'default';
  }
  
  // Lấy lớp CSS cho trạng thái thanh toán
  getPaymentStatusClass(status: string | undefined): string {
    if (!status) return 'status-paid';
    const statusClasses: { [key: string]: string } = {
      'paid': 'status-paid',
      'pending': 'status-pending',
      'partial': 'status-partial',
      'included_in_room_charge': 'status-included'
    };
    return statusClasses[status.toLowerCase()] || '';
  }
  
  // Kiểm tra xem dịch vụ có trong danh sách sản phẩm không
  isServiceInProducts(service: Service): boolean {
    if (!this.invoiceData?.products || !service?.name) {
      return false;
    }
    // Kiểm tra chính xác tên trước
    if (this.invoiceData.products.some(p => p.name === service.name)) {
        return true;
    }
    // Kiểm tra bao gồm (nếu cần, có thể làm logic phức tạp hơn)
    // return this.invoiceData.products.some(product => 
    //   product.name && (product.name.includes(service.name) || service.name.includes(product.name))
    // );
    return false; // Chỉ kiểm tra tên chính xác cho đơn giản
  }
  
  // Kiểm tra xem danh sách sản phẩm có chứa các dịch vụ không
  hasServiceProductsDuplicated(): boolean {
     // Hàm này có thể không cần thiết nữa nếu isServiceInProducts hoạt động đúng
     return false; 
  }

  exportInvoice(): void {
    const docDefinition: any = {
      content: [
        { text: this.invoiceData?.businessName || 'Khách sạn', style: 'header' },
        { text: this.invoiceData?.business_address || 'Chưa có địa chỉ' },
        { text: `ĐT: ${this.invoiceData?.phoneNumber || 'Chưa có số điện thoại'}` },
        { text: `Số hóa đơn: ${this.invoiceData?.invoiceNumber || ''}`, alignment: 'right' },
        { text: `Ngày: ${new Date(this.invoiceData?.date).toLocaleDateString('vi-VN')}`, alignment: 'right' },
        { text: 'HOÁ ĐƠN THANH TOÁN', style: 'invoiceTitle', margin: [0, 20, 0, 20] },
        {
          columns: [
            [
              { text: `Nhân viên: ${this.invoiceData?.staffName || 'Không có thông tin'}` },
              { text: `Phòng: ${this.invoiceData?.roomNumber || ''}` },
              { text: `Ngày đến: ${new Date(this.invoiceData?.checkInTime || 0).toLocaleString('vi-VN')}` },
              { text: `Thời gian lưu trú: ${this.durationText}` }
            ],
            [
              { text: `Khách hàng: ${this.invoiceData?.customerName || 'Khách lẻ'}` },
              { text: `SĐT: ${this.invoiceData?.customerPhone || 'N/A'}` },
              { text: `Thanh toán: ${this.getPaymentMethodLabel(this.invoiceData?.paymentMethod || '')}` },
              { text: `Ngày đi: ${new Date(this.invoiceData?.checkOutTime || 0).toLocaleString('vi-VN')}` }
            ]
          ]
        },
        { margin: [0, 20, 0, 0], 
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body: [
              ['Tên hàng', 'Số lượng', 'Đơn giá', 'Thành tiền'],
              ...this.invoiceData?.products.map((product: InvoiceProduct) => [
                product.name,
                product.quantity || 'x1',
                this.formatCurrency(product.price),
                this.formatCurrency(product.price * (product.quantity || 1))
              ]),
              ['Tổng tiền hàng', '', '', this.formatCurrency(this.subtotal)],
              ['Phụ thu (Charges)', '', '', this.formatCurrency(this.invoiceData?.additionalCharges || 0)],
              ['Khuyến mãi (Discount)', '', '', this.formatCurrency(this.invoiceData?.discount || 0)],
              [{ text: 'Tổng tiền (Total)', bold: true }, '', '', { text: this.formatCurrency(this.finalTotalAmount), bold: true }]
            ]
          }
        },
        {
          text: [
            '\n\nTrạng thái thanh toán: ', 
            { text: this.getPaymentStatusLabel(this.invoiceData?.paymentStatus || ''), bold: true },
            '\n\nCảm ơn quý khách đã sử dụng dịch vụ!\n',
            'Chúc quý khách một ngày tốt lành!'
          ],
          style: 'thankYou'
        }
      ],
      styles: {
        header: {
          fontSize: 16,
          bold: true
        },
        invoiceTitle: {
          fontSize: 20,
          bold: true,
          alignment: 'center'
        },
        thankYou: {
          fontSize: 12,
          alignment: 'center',
          margin: [0, 20, 0, 0]
        }
      }
    };

    // Sử dụng pdfMake toàn cục từ window
    window.pdfMake.createPdf(docDefinition).open();
  }

  // Hàm in hóa đơn
  printInvoice(): void {
    const documentDefinition = this.getDocumentDefinition();
    window.pdfMake.createPdf(documentDefinition).print();
  }

  // Hàm tạo cấu trúc tài liệu PDF cho pdfMake
  private getDocumentDefinition(): any {
    // Lấy font từ VFS (Virtual File System)
    // window.pdfMake.fonts = {
    //   Roboto: {
    //     normal: 'Roboto-Regular.ttf',
    //     bold: 'Roboto-Medium.ttf',
    //     italics: 'Roboto-Italic.ttf',
    //     bolditalics: 'Roboto-MediumItalic.ttf'
    //   }
    // };

    const checkInTime = this.invoiceData.checkInTime ? new Date(this.invoiceData.checkInTime).toLocaleString('vi-VN') : 'N/A';
    const checkOutTime = this.invoiceData.checkOutTime ? new Date(this.invoiceData.checkOutTime).toLocaleString('vi-VN') : 'N/A';

    // Tạo body cho bảng sản phẩm
    const productBody = (this.invoiceData.products || []).map(item => [
        item.name,
        { text: item.quantity || 1, alignment: 'right' },
        { text: this.formatCurrency(item.price || 0), alignment: 'right' },
        { text: this.formatCurrency((item.price || 0) * (item.quantity || 1)), alignment: 'right' }
    ]);

    // Tạo body cho bảng dịch vụ (chỉ những dịch vụ không có trong products)
    const serviceBody = (this.invoiceData.services || [])
      .filter(service => !this.isServiceInProducts(service))
      .map(item => [
        item.name,
        { text: item.quantity || 1, alignment: 'right' },
        { text: this.formatCurrency(item.price || 0), alignment: 'right' },
        { text: this.formatCurrency((item.price || 0) * (item.quantity || 1)), alignment: 'right' }
    ]);

    // Header của bảng chi tiết
     const tableHeader = [{ text: 'Diễn giải', style: 'tableHeader' }, { text: 'Số lượng', style: 'tableHeader', alignment: 'right' }, { text: 'Đơn giá', style: 'tableHeader', alignment: 'right' }, { text: 'Thành tiền', style: 'tableHeader', alignment: 'right' }];

    // Kết hợp body sản phẩm và dịch vụ
    let tableBody: any[] = [tableHeader, ...productBody];
    if (serviceBody.length > 0) {
        // Correctly type the object for colSpan - Use 'any' for simplicity here if type inference fails
        const serviceHeaderRow: any[] = [{text: '', colSpan: 4, style: 'tableHeader', alignment: 'center'} as any, {}, {}, {}];
        tableBody.push(serviceHeaderRow);
        tableBody = tableBody.concat(serviceBody);
    }

    return {
      // defaultStyle: {
      //   font: 'Roboto' // Sử dụng font Roboto
      // },
      content: [
        // Tiêu đề
        { text: 'HÓA ĐƠN THANH TOÁN', style: 'header', alignment: 'center', margin: [0, 0, 0, 20] },

        // Thông tin doanh nghiệp và khách hàng
        {
          columns: [
            {
              width: '*',
              text: [
                { text: this.invoiceData.businessName || 'Tên Doanh Nghiệp', style: 'subheader' },
                `\nĐịa chỉ: ${this.invoiceData.business_address || 'Địa chỉ doanh nghiệp'}`,
                `\nĐiện thoại: ${this.invoiceData.phoneNumber || 'Số điện thoại'}`
              ]
            },
            {
              width: '*',
              text: [
                { text: `Số HĐ: ${this.invoiceData.invoiceNumber || this.invoiceData['bookingId'] || 'N/A' }`, bold: true },
                `\nNgày: ${new Date(this.invoiceData.date).toLocaleDateString('vi-VN')}`,
                `\nNV Thu ngân: ${this.invoiceData.staffName || 'N/A'}`
              ],
              alignment: 'right'
            }
          ],
          margin: [0, 0, 0, 10]
        },

        // Thông tin khách hàng
        {
          text: [
            { text: 'Thông tin khách hàng:', style: 'subheader' },
            `\nTên khách hàng: ${this.invoiceData.customerName || this.invoiceData.guestInfo?.name || 'Khách lẻ'}`,
            `\nSố điện thoại: ${this.invoiceData.customerPhone || this.invoiceData.guestInfo?.phone || 'N/A'}`,
            `\nEmail: ${this.invoiceData.customerEmail || this.invoiceData.guestInfo?.email || 'N/A'}`
          ],
          margin: [0, 10, 0, 10]
        },

        // Thông tin phòng và thời gian lưu trú
        {
          text: [
            { text: 'Thông tin phòng:', style: 'subheader' },
            `\nPhòng: ${this.invoiceData.roomNumber || 'N/A'} - Loại: ${this.invoiceData.roomType || 'N/A'}`,
            // `\nGiá phòng: ${this.formatCurrency(this.invoiceData.roomRate || 0)}`,
            `\nCheck-in: ${checkInTime}`,
            `\nCheck-out: ${checkOutTime}`,
            `\nThời gian ở: ${this.durationText}`
          ],
          margin: [0, 0, 0, 10]
        },

        // Bảng chi tiết mới
        {
          style: 'tableExample',
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            body: tableBody
          },
          layout: 'lightHorizontalLines'
        },

        // Tổng cộng - sử dụng giá trị đã tính
        {
          style: 'totalsTable',
          table: {
            widths: ['*', 'auto'],
            body: [
              ['Tổng tiền dịch vụ(Total Service)', { text: this.formatCurrency(this.subtotal), alignment: 'right' }],
              // Chỉ hiển thị dòng tổng dịch vụ nếu có
              ...(this.serviceTotal > 0 ? [['Tổng tiền dịch vụ', { text: this.formatCurrency(this.serviceTotal), alignment: 'right' }]] : []),
              ['Phụ thu', { text: this.formatCurrency(this.invoiceData.additionalCharges || 0), alignment: 'right' }],
              ['Giảm giá', { text: this.formatCurrency(-(this.invoiceData.discount || 0)), alignment: 'right' }],
              ['Đã trả trước', { text: this.formatCurrency(-(this.invoiceData.advancePayment || 0)), alignment: 'right' }],
              [{ text: 'Tổng thanh toán', bold: true }, { text: this.formatCurrency(this.finalTotalAmount), bold: true, alignment: 'right' }]
            ]
          },
          layout: 'noBorders',
          margin: [0, 10, 0, 10]
        },

        // Phương thức thanh toán
        { text: `Hình thức thanh toán: ${this.getPaymentMethodLabel(this.invoiceData.paymentMethod)}`, margin: [0, 0, 0, 5] },
        { text: `Trạng thái: ${this.getPaymentStatusLabel(this.invoiceData.paymentStatus)}`, bold: true, margin: [0, 0, 0, 10] },

        // Ghi chú
        this.invoiceData.notes ? { text: `Ghi chú: ${this.invoiceData.notes}`, margin: [0, 0, 0, 20] } : '',

        // Chân trang
        { text: 'Cảm ơn quý khách đã sử dụng dịch vụ!', alignment: 'center', italics: true }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true
        },
        subheader: {
          fontSize: 14,
          bold: true,
          margin: [0, 10, 0, 5]
        },
        tableExample: {
          margin: [0, 5, 0, 15]
        },
        tableHeader: {
          bold: true,
          fontSize: 12,
          color: 'black'
        },
        totalsTable: {
          margin: [0, 0, 0, 10]
        }
      }
    };
  }

  // Gửi hóa đơn qua email
  sendInvoiceEmail(): void {
    const pdfDocGenerator = window.pdfMake.createPdf(this.getDocumentDefinition());
    const customerEmail = this.invoiceData.customerEmail || this.invoiceData.guestInfo?.email;
    if (!customerEmail) {
        alert('Không tìm thấy địa chỉ email của khách hàng.');
        return;
    }
    console.log('Chuẩn bị gửi hóa đơn PDF qua email cho:', customerEmail);
    alert(`Hóa đơn sẽ được gửi đến ${customerEmail}. Tính năng đang được phát triển.`);
    // TODO: Implement email sending logic. Get PDF as base64 or blob and send.
    // pdfDocGenerator.getBase64((dataUrl: string) => {
    //   // Send dataUrl to backend or use mailto link
    // });
  }
  
  // Tải xuống hóa đơn dưới dạng PDF
  downloadPDF(): void {
    const filename = `HoaDon_${this.invoiceData.invoiceNumber || this.invoiceData['bookingId'] || new Date().getTime()}.pdf`;
    const pdfDocGenerator = window.pdfMake.createPdf(this.getDocumentDefinition());
    pdfDocGenerator.download(filename);
  }
  
  // Xóa hóa đơn
  deleteInvoice(): void {
    if (confirm('Bạn có chắc chắn muốn xóa hóa đơn này không?')) {
      console.log('Xóa hóa đơn:', this.invoiceData.invoiceNumber);
      // TODO: Implement delete functionality with backend API
      alert('Hóa đơn đã được đánh dấu xóa. Tính năng đang được phát triển.');
    }
  }
}
