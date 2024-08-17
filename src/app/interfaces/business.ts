export interface Business {
    _id: string;
    name: string;
    address: string;
    tax_code: number;
    contact: {
      phone: string;
      email: string;
    };
    hotels?: string[]; // Nếu bạn có mối quan hệ với Hotel
}

