export interface Staff {
    _id: string;
    hotelId: string;
    name: string;
    positive: string;
    contact: {
        phone: string;
        email: string;
    };
    schedule:{
        day: string;
        shift: string;
    }
}