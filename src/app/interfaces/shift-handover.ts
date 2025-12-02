// ============ SHIFT HANDOVER INTERFACES ============

export type ShiftHandoverStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type PaymentMethodType = 'cash' | 'bank_transfer' | 'card';
export type RoomActionType = 'check_in' | 'check_out' | 'extend' | 'early_checkout' | 'room_change';
export type InvoiceType = 'room' | 'service' | 'other';

// Lịch sử phòng trong ca
export interface ShiftRoomHistory {
    roomId: string;
    roomNumber: string;
    bookingId?: string;
    action: RoomActionType;
    guestName?: string;
    amount: number;
    paymentMethod: PaymentMethodType;
    timestamp: Date;
    notes?: string;
}

// Hóa đơn trong ca
export interface ShiftInvoice {
    invoiceId?: string;
    invoiceNumber?: string;
    bookingId?: string;
    roomId?: string;
    roomNumber?: string;
    guestName?: string;
    amount: number;
    paymentMethod: PaymentMethodType;
    type: InvoiceType;
    timestamp: Date;
}

// Phiếu chi trong ca
export interface ShiftExpense {
    expenseId?: string;
    description: string;
    amount: number;
    category?: string;
    recipient?: string;
    approvedBy?: string;
    timestamp: Date;
}

// Phiếu thu trong ca
export interface ShiftIncome {
    incomeId?: string;
    description: string;
    amount: number;
    category?: string;
    source?: string;
    timestamp: Date;
}

// Dịch vụ trong ca
export interface ShiftServiceOrder {
    serviceOrderId?: string;
    roomId?: string;
    roomNumber?: string;
    serviceName: string;
    quantity: number;
    amount: number;
    paymentMethod: PaymentMethodType;
    timestamp: Date;
}

// Vấn đề chờ xử lý
export interface ShiftPendingIssue {
    description: string;
    priority: 'low' | 'medium' | 'high';
    createdAt: Date;
}

// ============ MAIN SHIFT HANDOVER INTERFACE ============

export interface ShiftHandover {
    _id?: string;
    hotelId: string;
    
    // Nhân viên giao ca
    fromStaffId: string;
    fromUserId: string;
    fromStaffName?: string;
    
    // Nhân viên nhận ca
    toStaffId: string;
    toUserId: string;
    toStaffName?: string;
    
    // Thời gian
    handoverTime: Date;
    shiftStartTime?: Date;
    shiftEndTime?: Date;
    
    // ============ TÍNH TIỀN GIAO CA ============
    // Công thức: Số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
    
    previousShiftAmount: number;     // Số tiền ca trước (nhận từ ca trước)
    cashInShift: number;             // Tiền mặt trong ca (thu được trong ca)
    managerHandoverAmount: number;   // Tiền giao quản lý
    actualReceivedAmount: number;    // Số tiền thực nhận trong ca
    handoverAmount: number;          // Số tiền giao ca (truyền cho ca sau)
    
    // ============ THÔNG TIN DOANH THU ============
    cashAmount: number;              // Tiền mặt
    bankTransferAmount: number;      // Tiền chuyển khoản (vào túi chủ/quản lý)
    cardPaymentAmount: number;       // Tiền cà thẻ (vào túi chủ/quản lý)
    expenseAmount: number;           // Tiền chi (phiếu chi)
    incomeAmount: number;            // Tiền thu (phiếu thu)
    totalRevenue: number;            // Tổng doanh thu = tiền mặt + chuyển khoản + cà thẻ - tiền chi
    totalRoomRevenue: number;        // Tổng tiền phòng trong ca
    
    // ============ LỊCH SỬ TRONG CA ============
    roomHistory?: ShiftRoomHistory[];
    invoices?: ShiftInvoice[];
    expenses?: ShiftExpense[];
    incomes?: ShiftIncome[];
    serviceOrders?: ShiftServiceOrder[];
    
    // ============ XÁC NHẬN GIAO CA ============
    confirmedByPassword: boolean;
    confirmed: boolean;
    confirmedAt?: Date;
    
    // Ghi chú
    notes?: string;
    pendingIssues?: ShiftPendingIssue[];
    
    // Trạng thái
    status: ShiftHandoverStatus;
    rejectionReason?: string;
    
    createdAt?: Date;
    updatedAt?: Date;
    
    // Virtual summary
    summary?: {
        handoverAmount: number;
        totalRevenue: number;
        totalRooms: number;
        totalInvoices: number;
        totalExpenses: number;
        totalIncomes: number;
    };
}

// ============ MANAGER HANDOVER (Giao tiền quản lý) ============

export interface ManagerHandover {
    _id?: string;
    hotelId: string;
    staffId: string;
    managerId: string;
    amount: number;
    notes?: string;
    createdAt?: Date;
}

// ============ SHIFT HANDOVER CREATE REQUEST ============

export interface ShiftHandoverCreateRequest {
    hotelId: string;
    fromStaffId: string;
    toStaffId: string;
    toUserPassword: string;  // Mật khẩu của người nhận ca để xác nhận
    previousShiftAmount?: number;
    cashInShift?: number;
    managerHandoverAmount?: number;
    cashAmount?: number;
    bankTransferAmount?: number;
    cardPaymentAmount?: number;
    expenseAmount?: number;
    incomeAmount?: number;
    roomHistory?: ShiftRoomHistory[];
    invoices?: ShiftInvoice[];
    expenses?: ShiftExpense[];
    incomes?: ShiftIncome[];
    serviceOrders?: ShiftServiceOrder[];
    notes?: string;
    pendingIssues?: ShiftPendingIssue[];
    shiftStartTime?: Date;
}

// ============ SHIFT HANDOVER RESPONSE ============

export interface ShiftHandoverResponse {
    message: string;
    shiftHandover: ShiftHandover;
    transaction?: any;
    login?: {
        token: string;
        user: {
            _id: string;
            username: string;
            email: string;
            fullName: string;
            role: string;
            hotelId?: string;
        };
        staff: {
            _id: string;
            personalInfo?: any;
            employmentInfo?: any;
        };
    };
}

// ============ REVENUE CALCULATION ============

export interface RevenueData {
    cashTotal: number;
    bankTransferTotal: number;
    cardTotal: number;
    expenseTotal: number;
    incomeTotal: number;
    totalRevenue: number;
    netRevenue: number;
    breakdown: {
        byMethod: {
            cash: number;
            bankTransfer: number;
            card: number;
        };
        byType: {
            income: number;
            expense: number;
        };
    };
}

export interface RevenueResponse {
    message: string;
    data: RevenueData;
    period?: {
        startDate?: string;
        endDate?: string;
    };
}

// ============ SHIFT STATS ============

export interface ShiftHandoverStats {
    _id: string;
    hotelName?: string;
    totalHandovers: number;
    totalCashAmount: number;
    totalBankTransfer: number;
    totalCardPayment: number;
    totalExpense: number;
    totalIncome: number;
    totalRevenue: number;
    totalRoomRevenue: number;
    avgHandoverAmount: number;
}

// ============ PAGINATION ============

export interface ShiftHandoverHistoryResponse {
    message: string;
    data: ShiftHandover[];
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
    };
}

