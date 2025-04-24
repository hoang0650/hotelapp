export interface Guest {
  _id?: string;
  name: string;
  idNumber: string;
  idType: string;
  phoneNumber?: string;
  email?: string;
  nationality?: string;
  dateOfBirth?: Date;
  address?: string;
  hotelId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GuestQuery {
  hotelId: string;
  page?: number;
  limit?: number;
  search?: string;
} 