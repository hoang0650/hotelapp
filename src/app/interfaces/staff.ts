// Staff Interface - theo backend model

export interface StaffPersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  nationality?: string;
  idType?: string;
  idNumber?: string;
  idExpiryDate?: Date;
  idScanUrl?: string;
}

export interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface StaffContactInfo {
  email?: string;
  phone?: string;
  emergencyContact?: EmergencyContact;
  address?: Address;
}

export interface BankAccount {
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}

export interface StaffEmploymentInfo {
  position: 'manager' | 'receptionist' | 'housekeeper' | 'maintenance' | 'other';
  department?: string;
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'on_leave' | 'terminated';
  salary?: number;
  allowance?: number; // Phụ cấp
  insurance?: number; // Bảo hiểm
  penalty?: number; // Phạt
  bonus?: number; // Thưởng
  advancePayment?: number; // Ứng lương
  bankAccount?: BankAccount;
  taxId?: string;
}

export interface StaffSchedule {
  date: Date;
  shift: 'morning' | 'afternoon' | 'night' | 'full-day';
  startTime?: string;
  endTime?: string;
  status?: 'scheduled' | 'completed' | 'absent' | 'late';
}

export interface StaffAttendance {
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  hoursWorked?: number;
  overtime?: number;
  status: 'present' | 'absent' | 'late' | 'leave';
}

export interface StaffLeave {
  startDate: Date;
  endDate: Date;
  type: 'annual' | 'sick' | 'personal' | 'unpaid';
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  approvedBy?: string;
}

export interface StaffPayroll {
  period: {
    startDate: Date;
    endDate: Date;
  };
  baseSalary: number;
  daysWorked?: number; // Số ngày thực làm
  allowance?: number; // Phụ cấp
  insurance?: number; // Bảo hiểm
  penalty?: number; // Phạt
  bonus?: number; // Thưởng
  advancePayment?: number; // Ứng lương
  overtime?: number;
  bonuses?: number;
  deductions?: number;
  netSalary: number;
  paymentDate?: Date;
  paymentStatus: 'pending' | 'paid';
  paymentReference?: string;
  calculatedAt?: Date; // Thời gian tính lương
}

export type StaffPermission = 'view' | 'create' | 'edit' | 'delete' | 'manage_rooms' | 'manage_bookings';

export interface Staff {
  _id?: string;
  userId: string;
  hotelId: string;
  personalInfo: StaffPersonalInfo;
  contactInfo?: StaffContactInfo;
  employmentInfo: StaffEmploymentInfo;
  schedule?: StaffSchedule[];
  attendance?: StaffAttendance[];
  leaves?: StaffLeave[];
  payroll?: StaffPayroll[];
  permissions?: StaffPermission[];
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: any;
}

// Helper để lấy tên đầy đủ
export function getStaffFullName(staff: Staff): string {
  if (!staff.personalInfo) return 'N/A';
  return `${staff.personalInfo.firstName || ''} ${staff.personalInfo.lastName || ''}`.trim() || 'N/A';
}

// Helper để lấy chức vụ tiếng Việt
export function getPositionLabel(position: string): string {
  const labels: Record<string, string> = {
    'manager': 'Quản lý',
    'receptionist': 'Lễ tân',
    'housekeeper': 'Housekeeping',
    'maintenance': 'Bảo trì',
    'other': 'Khác'
  };
  return labels[position] || position;
}

// Helper để lấy trạng thái tiếng Việt
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'active': 'Đang làm việc',
    'on_leave': 'Nghỉ phép',
    'terminated': 'Đã nghỉ việc'
  };
  return labels[status] || status;
}

// Helper để lấy ca làm việc tiếng Việt
export function getShiftLabel(shift: string): string {
  const labels: Record<string, string> = {
    'morning': 'Ca sáng',
    'afternoon': 'Ca chiều',
    'night': 'Ca đêm',
    'full-day': 'Cả ngày'
  };
  return labels[shift] || shift;
}
