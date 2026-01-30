import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { RoomsService } from '../../services/rooms.service';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { take } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';

interface BotRoomItem {
  name: string;
  price: string;
  description: string;
  use_case?: string;
  images?: string[];
  amenities?: string[];
}

@Component({
  selector: 'app-bot-setting',
  templateUrl: './bot-setting.component.html',
  styleUrls: ['./bot-setting.component.css']
})
export class BotSettingComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  syncing = false;

  constructor(
    private fb: FormBuilder,
    private msg: NzMessageService,
    private auth: AuthService,
    private hotelService: HotelService,
    private aiService: AiAssistantService,
    private translate: TranslateService,
    private router: Router,
    private roomsService: RoomsService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      hotelName: ['', [Validators.required]],
      location: this.fb.group({
        street: [''],
        city: [''],
        country: ['']
      }),
      checkin_time: ['14:00'],
      checkout_time: ['12:00'],
      rooms: this.fb.array([])
    });
    this.loadInitialHotelAndRooms();
  }

  get rooms(): FormArray {
    return this.form.get('rooms') as FormArray;
  }

  addRoom(): void {
    this.rooms.push(
      this.fb.group({
        name: ['', [Validators.required]],
        price: ['', [Validators.required]],
        description: [''],
        use_case: [''],
        images: this.fb.array([]),
        amenities: this.fb.array([])
      })
    );
  }

  removeRoom(index: number): void {
    this.rooms.removeAt(index);
  }

  addImage(i: number): void {
    const arr = this.rooms.at(i).get('images') as FormArray;
    arr.push(this.fb.control(''));
  }

  removeImage(i: number, j: number): void {
    const arr = this.rooms.at(i).get('images') as FormArray;
    arr.removeAt(j);
  }

  addAmenity(i: number): void {
    const arr = this.rooms.at(i).get('amenities') as FormArray;
    arr.push(this.fb.control(''));
  }

  removeAmenity(i: number, j: number): void {
    const arr = this.rooms.at(i).get('amenities') as FormArray;
    arr.removeAt(j);
  }

  getImages(i: number): FormArray {
    return this.rooms.at(i).get('images') as FormArray;
  }

  getAmenities(i: number): FormArray {
    return this.rooms.at(i).get('amenities') as FormArray;
  }

  private loadInitialHotelAndRooms(): void {
    const u = this.auth.getCurrentUser();
    const hotelId = u?.hotelId || null;
    if (!hotelId) {
      return;
    }
    this.hotelService.getHotelInfo(hotelId).pipe(take(1)).subscribe({
      next: (hotel: any) => {
        if (!hotel) return;
        const name = hotel.name || '';
        const addr = hotel.address || {};
        const street = addr.street || '';
        const city = addr.city || '';
        const country = addr.country || '';
        const checkIn = hotel.settings?.checkInTime || this.form.get('checkin_time')?.value || '14:00';
        const checkOut = hotel.settings?.checkOutTime || this.form.get('checkout_time')?.value || '12:00';
        this.form.patchValue({
          hotelName: name,
          location: { street, city, country },
          checkin_time: checkIn,
          checkout_time: checkOut
        });
      },
      error: () => {}
    });
    this.roomsService.getRooms({ hotelId }).pipe(take(1)).subscribe({
      next: (rooms: any[]) => {
        if (!rooms || rooms.length === 0) return;
        const byType = new Map<string, any>();
        rooms.forEach((room: any) => {
          const t = room.type || '';
          if (!t) return;
          const curr = byType.get(t);
          const images = Array.from(new Set([...(curr?.images || []), ...((room.images || []) as string[])]));
          const amenities = Array.from(new Set([...(curr?.amenities || []), ...((room.amenities || []) as string[])]));
          const priceNum = room.pricing?.daily ?? room.pricing?.nightly ?? room.pricing?.hourly ?? curr?.priceNum ?? null;
          const currency = room.pricing?.currency ?? curr?.currency ?? '';
          const priceStr = priceNum !== null && priceNum !== undefined ? `${priceNum}${currency ? ' ' + currency : ''}` : (curr?.price || '');
          const desc = room.description || curr?.description || '';
          byType.set(t, {
            name: t,
            price: priceStr,
            priceNum,
            currency,
            description: desc,
            use_case: '',
            images,
            amenities
          });
        });
        const roomArray = this.form.get('rooms') as FormArray;
        roomArray.clear();
        Array.from(byType.values()).forEach((item: any) => {
          roomArray.push(
            this.fb.group({
              name: [item.name || '', [Validators.required]],
              price: [item.price || '', [Validators.required]],
              description: [item.description || ''],
              use_case: [item.use_case || ''],
              images: this.fb.array(item.images || []),
              amenities: this.fb.array(item.amenities || [])
            })
          );
        });
      },
      error: () => {}
    });
  }

  async saveSettings(): Promise<void> {
    if (this.form.invalid) {
      this.msg.warning(this.translate.instant('Vui lòng điền đủ thông tin bắt buộc'));
      return;
    }
    const u = this.auth.getCurrentUser();
    const hotelId = u?.hotelId || null;
    if (!hotelId) {
      this.msg.error(this.translate.instant('Không tìm thấy khách sạn hiện tại'));
      return;
    }
    this.saving = true;
    try {
      const val = this.form.value;
      const botContext = {
        hotel_name: val.hotelName,
        location: [val.location?.street, val.location?.city, val.location?.country].filter(Boolean).join(', '),
        checkin_time: val.checkin_time,
        checkout_time: val.checkout_time,
        rooms: (val.rooms || []).map((r: any) => ({
          name: r.name,
          price: r.price,
          description: r.description,
          use_case: r.use_case,
          images: (r.images || []).filter((x: string) => !!x),
          amenities: (r.amenities || []).filter((x: string) => !!x)
        }))
      };
      await this.hotelService.updateHotelSettings(hotelId, { enableAiChatbox: true, botContext }).pipe(take(1)).toPromise();
      this.msg.success(this.translate.instant('Đã lưu cấu hình bot'));
    } catch {
      this.msg.error(this.translate.instant('Lưu cấu hình thất bại'));
    } finally {
      this.saving = false;
    }
  }

  private toProducts(val: any): BotRoomItem[] {
    const rooms: BotRoomItem[] = (val.rooms || []).map((r: any) => ({
      name: r.name,
      price: r.price,
      description: r.description,
      use_case: r.use_case,
      images: (r.images || []).filter((x: string) => !!x),
      amenities: (r.amenities || []).filter((x: string) => !!x)
    }));
    return rooms;
  }

  async syncAI(): Promise<void> {
    const u = this.auth.getCurrentUser();
    const tenantId = (u?.hotelId || u?.businessId || 'default').toString();
    const val = this.form.value;
    const products = this.toProducts(val).map(p => ({
      name: p.name,
      price: p.price,
      description: [p.description, (p.amenities || []).join(', ')].filter(Boolean).join(' | '),
      use_case: p.use_case || ''
    }));
    if (products.length === 0) {
      this.msg.warning(this.translate.instant('Vui lòng thêm ít nhất một hạng phòng'));
      return;
    }
    this.syncing = true;
    try {
      const botContext = {
        hotel_name: val.hotelName,
        location: [val.location?.street, val.location?.city, val.location?.country].filter(Boolean).join(', '),
        checkin_time: val.checkin_time,
        checkout_time: val.checkout_time,
        rooms: (val.rooms || []).map((r: any) => ({
          name: r.name,
          price: r.price,
          description: r.description,
          use_case: r.use_case,
          images: (r.images || []).filter((x: string) => !!x),
          amenities: (r.amenities || []).filter((x: string) => !!x)
        }))
      };
      await this.aiService.uploadDatasetExternal(tenantId, products as any, botContext);
      this.msg.success(this.translate.instant('Đã đồng bộ dữ liệu AI'));
    } catch {
      this.msg.error(this.translate.instant('Đồng bộ AI thất bại'));
    } finally {
      this.syncing = false;
    }
  }
}
