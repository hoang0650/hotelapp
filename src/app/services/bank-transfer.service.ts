import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// Interface cho một giao dịch từ SePay (dựa trên controller)
export interface SepayTransaction {
  transaction_id: string; // Hoặc tên trường ID thực tế từ SePay
  transaction_date: string; // Hoặc Date
  transaction_content: string;
  amount: number;
  bank_brand_name?: string;
  account_number?: string; 
  reference_number?: string;
  status?: string; // Trạng thái từ SePay
  // Thêm các trường khác nếu SePay API trả về
  source?: string; // Để phân biệt nếu gộp nhiều nguồn
  [key: string]: any; // Cho các trường không xác định trước
}

// Interface cho response từ API lấy giao dịch SePay (theo controller)
export interface SepayTransactionResponse {
  data: SepayTransaction[];
  total: number;
  // currentPage?: number; // Nếu backend trả về
  // totalPages?: number; // Nếu backend trả về
}

// Interface BankTransfer cũ có thể giữ lại nếu dùng cho mục đích khác, hoặc loại bỏ/thay thế
// export interface BankTransfer {
//   id: string;
//   amount: number;
//   fromAccount: string;
//   toAccount: string;
//   bankName: string;
//   transferTime: Date;
//   status: 'success' | 'pending' | 'failed';
//   description: string;
// }

@Injectable({
  providedIn: 'root'
})
export class BankTransferService {
  private apiUrl = 'http://localhost:3000'; // Thay đổi URL API theo backend của bạn
  private sepayApiUrl = `${this.apiUrl}/sepay`; 

  constructor(private http: HttpClient) { }

  // Các hàm getTransferHistory, getTransferById, searchTransfers CẦN XEM XÉT LẠI.
  // Chúng không khớp với sepayController hoặc bankIntegrations model hiện tại.
  // Nếu chúng dành cho bankIntegrations, cần có API backend tương ứng.
  // Tạm thời comment out hoặc sửa nếu đã có API rõ ràng.

  /*
  getTransferHistory(): Observable<BankTransfer[]> {
    return this.http.get<BankTransfer[]>(`${this.apiUrl}/bank-transactions`); // Ví dụ endpoint mới
  }

  getTransferById(id: string): Observable<BankTransfer> {
    return this.http.get<BankTransfer>(`${this.apiUrl}/bank-transactions/${id}`);
  }

  searchTransfers(params: any): Observable<BankTransfer[]> {
    return this.http.get<BankTransfer[]>(`${this.apiUrl}/bank-transactions/search`, { params });
  }
  */

  // Đăng nhập SePay
  sepayLogin(username: string, password: string): Observable<{ token: string }> {
    return this.http.post<{ token: string }>(`${this.sepayApiUrl}/auth`, { username, password });
  }

  // Lấy lịch sử giao dịch từ SePay qua backend proxy
  getSepayTransactions(sepayToken: string, params?: {
    date_from?: string;
    date_to?: string;
    status?: string;
    bankName?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<SepayTransactionResponse> {
    let httpHeaders = new HttpHeaders();
    if (sepayToken) {
      httpHeaders = httpHeaders.set('Authorization', `Bearer ${sepayToken}`);
    }

    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return this.http.get<SepayTransactionResponse>(`${this.sepayApiUrl}/transactions`, {
      headers: httpHeaders,
      params: httpParams
    });
  }
} 