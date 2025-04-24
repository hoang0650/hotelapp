export interface Hotel {
    _id: string;
    name: string;
    address: string;
    tax_code: number;
    contact: {
        phone: string;
        email: string;
    };
    businessId: string;
    rooms: string[];
    staff: string[];
    phoneNumber?: string;
}