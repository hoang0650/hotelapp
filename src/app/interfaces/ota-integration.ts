import { Hotel } from './hotel';
import { Room } from './rooms';

export type OtaProvider = 'Channex' | 'Booking.com' | 'Agoda' | 'Traveloka' | 'Trip.com' | 'Expedia' | 'G2J' | 'Airbnb';
export const ALL_OTA_PROVIDERS: OtaProvider[] = ['Channex', 'Booking.com', 'Agoda', 'Traveloka', 'Trip.com', 'Expedia', 'G2J'];

export type ChannelAdapterType = 'channex' | 'booking_com' | 'agoda' | 'traveloka' | 'trip_com' | 'expedia' | 'g2j';
export type ChannelSyncDirection = 'push' | 'pull' | 'bidirectional';
export type ChannelSupportedFunction =
  | 'pull_reservations'
  | 'push_availability'
  | 'push_rates'
  | 'push_restrictions'
  | 'push_content'
  | 'test_connection'
  | 'sync_mappings';

export interface ChannelCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'boolean';
  required?: boolean;
}

/** Metadata từ GET /ota-integrations/channels/adapters — mirrors HAIP adapter registry */
export interface ChannelAdapterDefinition {
  adapterType: ChannelAdapterType;
  channelCode: string;
  channelName: string;
  provider: OtaProvider;
  adapterKind: 'direct' | 'aggregator';
  syncDirection: ChannelSyncDirection;
  supportedFunctions: ChannelSupportedFunction[];
  color: string;
  credentialFields: ChannelCredentialField[];
  isRegistered?: boolean;
}

export type OtaIntegrationStatus = 'active' | 'inactive' | 'error' | 'pending';
export type OtaBookingStatus = 'pending' | 'confirmed' | 'modified' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type PaymentMethod = 'pay_at_property' | 'prepaid' | 'credit_card' | 'bank_transfer' | 'virtual_card' | 'other';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled';

export interface OtaCredentials {
    // Common credentials
    username?: string;
    password?: string;
    hotelId?: string;
    propertyId?: string;
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    
    // Agoda specific
    agodaPartnerId?: string;
    agodaApiKey?: string;
    
    // Traveloka specific
    travelokaClientId?: string;
    travelokaClientSecret?: string;
    
    // Trip.com specific
    tripClientId?: string;
    tripClientSecret?: string;
    tripPartnerCode?: string;
    
    // Expedia specific
    expediaApiKey?: string;
    expediaSecret?: string;
    expediaHotelId?: string;

    // Channex specific
    channexApiKey?: string;
    channexPropertyId?: string;
    useStaging?: boolean;
    baseUrl?: string;
    webhookSecret?: string;
}

export interface OtaSettings {
    autoAcceptBookings: boolean;
    updateInventory: boolean;
    updatePrices: boolean;
    updateAvailability: boolean;
    currencyCode: string;
    languageCode: string;
    autoSyncInterval: number;
    notificationEmail?: string;
    markupPercentage: number;
    minimumStay: number;
    maximumStay: number;
}

export interface CancellationPolicy {
    type: 'free' | 'percentage' | 'fixed';
    deadlineDays: number;
    penaltyAmount: number;
    penaltyPercentage?: number;
    description?: string;
}

export interface OtaRoomTypeMapping {
    _id?: string;
    localRoomTypeId: string | Room;
    otaRoomTypeId?: string;
    otaRoomTypeName?: string;
    maxOccupancy: number;
    baseRate: number;
    extraBedRate?: number;
    mealPlan?: string;
    amenities?: string[];
    photos?: string[];
    description?: string;
}

export interface OtaRatePlanMapping {
    _id?: string;
    localRatePlanId: string;
    otaRatePlanId?: string;
    otaRatePlanName?: string;
    mealPlan?: string;
    cancellationPolicy: CancellationPolicy;
    restrictions?: {
        minStay?: number;
        maxStay?: number;
        closedToArrival?: boolean;
        closedToDeparture?: boolean;
    };
}

export interface OtaMappings {
    roomTypes?: OtaRoomTypeMapping[];
    ratePlans?: OtaRatePlanMapping[];
}

export interface PropertyAddress {
    street: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
    coordinates?: {
        latitude: number;
        longitude: number;
    };
}

export interface PropertyPolicies {
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicy: string;
    childrenPolicy?: string;
    petPolicy?: string;
    paymentPolicy?: string;
}

export interface PropertyInfo {
    name: string;
    address: PropertyAddress;
    starRating: number;
    facilities: string[];
    policies: PropertyPolicies;
    description?: string;
    photos?: string[];
    amenities?: string[];
    contactInfo?: {
        phone?: string;
        email?: string;
        website?: string;
    };
}

export interface OtaErrorLog {
    timestamp: Date;
    message: string;
    code?: string;
    details?: any;
    provider: OtaProvider;
    severity: 'low' | 'medium' | 'high';
}

export interface OtaIntegration {
    _id: string;
    hotelId: string | Hotel;
    provider: OtaProvider;
    adapterType?: ChannelAdapterType;
    channelCode?: string;
    channelName?: string;
    syncDirection?: ChannelSyncDirection;
    config?: OtaCredentials;
    credentials?: OtaCredentials;
    status: OtaIntegrationStatus;
    lastSync?: Date;
    syncFrequency: number;
    settings: OtaSettings;
    mappings: {
        roomTypes: OtaRoomTypeMapping[];
        ratePlans: OtaRatePlanMapping[];
    };
    propertyInfo?: PropertyInfo;
    errorLog?: OtaErrorLog[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: any;
}

// ============ OTA BOOKING - CẬP NHẬT THEO BACKEND MỚI ============

export interface OtaBookingGuestDetails {
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    nationality?: string;
    idType?: string;
    idNumber?: string;
    address?: {
        street?: string;
        city?: string;
        country?: string;
        postalCode?: string;
    };
    specialRequests?: string;
    numberOfGuests?: {
        adults: number;
        children: number;
        infants?: number;
    };
}

export interface OtaBookingRoomDetails {
    roomTypeId?: string;
    roomTypeName: string;
    roomCount: number;
    bedType?: string;
    mealPlan?: string;
    amenities?: string[];
    maxOccupancy?: number;
}

export interface OtaBookingPricing {
    totalAmount: number;
    currency: string;
    basePrice?: number;
    taxes?: number;
    fees?: number;
    discount?: number;
    commission?: number;
    netAmount?: number;
    pricePerNight?: number;
    extraCharges?: {
        description: string;
        amount: number;
    }[];
}

export interface OtaBookingPaymentDetails {
    cardType?: string;
    cardLast4?: string;
    expiryDate?: string;
    virtualCardNumber?: string;
    virtualCardCvv?: string;
    virtualCardExpiry?: string;
    paidAmount?: number;
    refundedAmount?: number;
    paymentHistory?: {
        amount: number;
        date: Date;
        method: string;
        transactionId?: string;
        note?: string;
    }[];
}

export interface OtaBookingCancellationInfo {
    cancelledAt?: Date;
    cancelledBy?: string;
    reason?: string;
    penalty?: number;
    refundAmount?: number;
}

export interface OtaBookingPolicies {
    cancellationPolicy?: string;
    cancellationDeadline?: Date;
    prepaymentRequired?: boolean;
    noShowPolicy?: string;
    remarks?: string;
}

export interface OtaBookingSyncStatus {
    lastSyncAt?: Date;
    lastSyncStatus?: 'success' | 'failed' | 'pending';
    lastSyncError?: string;
    syncAttempts?: number;
}

export interface OtaBookingLog {
    action: string;
    timestamp: Date;
    userId?: string;
    staffId?: string;
    details?: string;
    previousValue?: any;
    newValue?: any;
}

export interface OtaBooking {
    _id?: string;
    otaProvider: OtaProvider;
    otaBookingId: string;
    otaConfirmationNumber?: string;
    
    hotelId: string;
    localBookingId?: string;
    localRoomId?: string;
    integrationId?: string;

    guestDetails: OtaBookingGuestDetails;
    roomDetails: OtaBookingRoomDetails;
    
    checkInDate: Date;
    checkOutDate: Date;
    checkInTime?: string;
    checkOutTime?: string;
    numberOfNights?: number;
    
    pricing: OtaBookingPricing;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    paymentDetails?: OtaBookingPaymentDetails;
    
    status: OtaBookingStatus;
    otaStatus?: string;
    cancellationInfo?: OtaBookingCancellationInfo;
    policies?: OtaBookingPolicies;
    
    syncStatus?: OtaBookingSyncStatus;
    logs?: OtaBookingLog[];
    
    notes?: string;
    internalNotes?: string;
    rawData?: any;
    
    createdAt?: Date;
    updatedAt?: Date;
    metadata?: any;
    
    // Virtual fields cho calendar
    summary?: {
        bookingId: string;
        guestName: string;
        roomType: string;
        checkIn: Date;
        checkOut: Date;
        totalAmount: number;
        status: string;
        provider: string;
    };
}

// ============ CALENDAR DATA ============

export interface OtaCalendarEvent {
    id: string;
    otaBookingId: string;
    provider: OtaProvider;
    title: string;
    start: Date;
    end: Date;
    guestName: string;
    guestPhone?: string;
    guestEmail?: string;
    roomType: string;
    roomId?: string;
    roomNumber?: string;
    totalAmount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    status: OtaBookingStatus;
    numberOfNights?: number;
    numberOfGuests?: {
        adults: number;
        children: number;
    };
    color: string;
    extendedProps?: {
        otaProvider: OtaProvider;
        confirmationNumber?: string;
        specialRequests?: string;
    };
}

export interface OtaCalendarResponse {
    message: string;
    data: OtaCalendarEvent[];
    rooms: {
        _id: string;
        roomNumber: string;
        floor: string;
        type: string;
    }[];
    summary: {
        total: number;
        byProvider: Record<string, number>;
    };
}

// ============ OTA PROVIDER COLORS ============

export const OTA_PROVIDER_COLORS: Record<string, string> = {
    'Channex': '#00b4a0',
    'Booking.com': '#003580',
    'Agoda': '#5391ff',
    'Traveloka': '#0194f3',
    'Trip.com': '#287dfa',
    'Expedia': '#00355f',
    'G2J': '#ff6b35',
    'Airbnb': '#ff5a5f'
};
