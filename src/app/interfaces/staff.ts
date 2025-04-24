export interface Staff {
    _id?: string;
    hotelId: string;
    userId?: string;
    name: string;
    position: 'manager' | 'receptionist' | 'housekeeper' | 'maintenance' | 'other';
    contact: {
        phone: string;
        email: string;
    };
    schedule: Array<{
        date: Date;
        shift: 'morning' | 'afternoon' | 'night' | 'full-day';
    }>;
    permissions?: Array<'view' | 'create' | 'edit' | 'delete' | 'manage_rooms' | 'manage_bookings'>;
    salary?: {
        amount: number;
        paymentHistory?: Array<{
            date: Date;
            amount: number;
        }>;
    };
    createdAt?: Date;
    updatedAt?: Date;
}