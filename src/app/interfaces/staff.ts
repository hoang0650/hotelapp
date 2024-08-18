export interface Staff {
    _id: string;
    hotelId: string;
    name: string;
    position: string;
    contact: {
        phone: string;
        email: string;
    };
    schedule:{
        day: Date;
        shift: string;
    }
}