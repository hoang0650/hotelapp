import { Hotel } from './hotel';

export interface Business {
    _id?: string;
    name: string;
    address: string;
    tax_code: number;
    contact: {
      phone: string;
      email: string;
    };
    status?: 'active' | 'inactive' | 'pending' | 'block' | 'reject' | 'unactive';
    hotels?: string[] | Hotel[]; // Có thể là danh sách IDs hoặc danh sách hotels được populate
    _hotelObjects?: any[]; // Để lưu trữ tạm thời đối tượng Hotel khi cần chuyển đổi
    ownerId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

