import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { RoomsService } from '../../services/rooms.service';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
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
      hotline: [''],
      email_support: [''],
      bankTransfer: this.fb.group({
        enabled: [false],
        depositAmount: [0],
        currency: ['VND'],
        paymentCodePrefix: ['BOT'],
        depositInstructions: [''],
        bankName: [''],
        accountNumber: [''],
        beneficiaryName: [''],
        qrPaymentUrl: ['']
      }),
      rooms: this.fb.array([]),
      questions: this.fb.array([])
    });
    this.loadInitialHotelAndRooms();
  }

  get rooms(): FormArray {
    return this.form.get('rooms') as FormArray;
  }

  get questions(): FormArray {
    return this.form.get('questions') as FormArray;
  }

  addQuestion(): void {
    this.questions.push(
      this.fb.group({
        question: ['', [Validators.required]],
        answer: ['', [Validators.required]]
      })
    );
  }

  removeQuestion(index: number): void {
    this.questions.removeAt(index);
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

  resetRoomsFromService(): void {
    const u = this.auth.getCurrentUser();
    const hotelId = u?.hotelId || null;
    if (hotelId) {
      this.loadRoomsFromService(hotelId);
      this.msg.success(this.translate.instant('BOT_SETTING.MESSAGES.ROOMS_RELOADED'));
    }
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
        const contactInfo = hotel.contactInfo || {};
        const hotline = hotel.settings?.botContext?.hotline || contactInfo.phone || '';
        const emailSupport = hotel.settings?.botContext?.email_support || contactInfo.email || '';
        const botBankTransfer = hotel.settings?.botContext?.bankTransfer || {};
        const hotelBankAccount = hotel.bankAccount || {};
        this.form.patchValue({
          hotelName: name,
          location: { street, city, country },
          checkin_time: checkIn,
          checkout_time: checkOut,
          hotline,
          email_support: emailSupport,
          bankTransfer: {
            enabled: botBankTransfer.enabled ?? false,
            depositAmount: botBankTransfer.depositAmount ?? 0,
            currency: botBankTransfer.currency || 'VND',
            paymentCodePrefix: botBankTransfer.paymentCodePrefix || 'BOT',
            depositInstructions: botBankTransfer.depositInstructions || '',
            bankName: botBankTransfer.bankName || hotelBankAccount.bankName || '',
            accountNumber: botBankTransfer.accountNumber || hotelBankAccount.accountNumber || '',
            beneficiaryName: botBankTransfer.beneficiaryName || hotelBankAccount.beneficiaryName || hotelBankAccount.accountHolderName || '',
            qrPaymentUrl: botBankTransfer.qrPaymentUrl || hotelBankAccount.qrPaymentUrl || ''
          }
        });

        const botContext = hotel.settings?.botContext || {};
        
        // Load questions
        const questions = botContext.questions || [];
        const questionArray = this.form.get('questions') as FormArray;
        questionArray.clear();
        questions.forEach((q: any) => {
          questionArray.push(
            this.fb.group({
              question: [q.question || '', [Validators.required]],
              answer: [q.answer || '', [Validators.required]]
            })
          );
        });

        // Load rooms from botContext if available, otherwise fetch from RoomsService
        if (botContext.rooms && botContext.rooms.length > 0) {
          const roomArray = this.form.get('rooms') as FormArray;
          roomArray.clear();
          botContext.rooms.forEach((r: any) => {
            roomArray.push(
              this.fb.group({
                name: [r.name || '', [Validators.required]],
                price: [r.price || '', [Validators.required]],
                description: [r.description || ''],
                use_case: [r.use_case || ''],
                images: this.fb.array(r.images || []),
                amenities: this.fb.array(r.amenities || [])
              })
            );
          });
        } else {
          this.loadRoomsFromService(hotelId);
        }
      },
      error: () => {}
    });
  }

  private loadRoomsFromService(hotelId: string): void {
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
      this.form.markAllAsTouched();
      this.msg.warning(this.translate.instant('BOT_SETTING.MESSAGES.REQUIRED_FIELDS'));
      return;
    }
    const u = this.auth.getCurrentUser();
    const hotelId = u?.hotelId || null;
    if (!hotelId) {
      this.msg.error(this.translate.instant('BOT_SETTING.MESSAGES.HOTEL_NOT_FOUND'));
      return;
    }
    this.saving = true;
    try {
      const val = this.form.value;
      const botContext = this.buildBotContext(val);
      await firstValueFrom(this.hotelService.updateHotelSettings(hotelId, { enableAiChatbox: true, botContext }).pipe(take(1)));
      try {
        await this.syncAIContext(hotelId, val, botContext);
        this.msg.success(this.translate.instant('BOT_SETTING.MESSAGES.SAVE_AND_SYNC_SUCCESS'));
      } catch {
        this.msg.warning(this.translate.instant('BOT_SETTING.MESSAGES.SAVE_SYNC_PARTIAL'));
      }
    } catch {
      this.msg.error(this.translate.instant('BOT_SETTING.MESSAGES.SAVE_ERROR'));
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

  private buildBotContext(val: any): any {
    return {
      hotel_name: val.hotelName,
      location: [val.location?.street, val.location?.city, val.location?.country].filter(Boolean).join(', '),
      street: val.location?.street || '',
      city: val.location?.city || '',
      country: val.location?.country || '',
      checkin_time: val.checkin_time,
      check_in_time: val.checkin_time,
      checkout_time: val.checkout_time,
      check_out_time: val.checkout_time,
      hotline: val.hotline || '',
      email_support: val.email_support || '',
      bankTransfer: {
        enabled: !!val.bankTransfer?.enabled,
        depositAmount: Number(val.bankTransfer?.depositAmount || 0),
        currency: val.bankTransfer?.currency || 'VND',
        paymentCodePrefix: val.bankTransfer?.paymentCodePrefix || 'BOT',
        depositInstructions: val.bankTransfer?.depositInstructions || '',
        bankName: val.bankTransfer?.bankName || '',
        accountNumber: val.bankTransfer?.accountNumber || '',
        beneficiaryName: val.bankTransfer?.beneficiaryName || '',
        qrPaymentUrl: val.bankTransfer?.qrPaymentUrl || ''
      },
      rooms: (val.rooms || []).map((r: any) => ({
        name: r.name,
        price: r.price,
        description: r.description,
        use_case: r.use_case,
        images: (r.images || []).filter((x: string) => !!x),
        amenities: (r.amenities || []).filter((x: string) => !!x)
      })),
      questions: (val.questions || []).map((q: any) => ({
        question: q.question,
        answer: q.answer
      }))
    };
  }

  async syncAI(): Promise<void> {
    const u = this.auth.getCurrentUser();
    const hotelId = u?.hotelId || null;
    if (!hotelId) {
      this.msg.error(this.translate.instant('BOT_SETTING.MESSAGES.HOTEL_NOT_FOUND'));
      return;
    }
    const tenantId = hotelId.toString();
    const val = this.form.value;
    const roomItems = this.toProducts(val).map(p => ({
      type: 'room',
      name: p.name,
      price: p.price,
      description: [p.description, (p.amenities || []).join(', ')].filter(Boolean).join(' | '),
      use_case: p.use_case || ''
    }));

    const qaItems = (val.questions || []).map((q: any) => ({
      type: 'qa',
      name: 'Q&A',
      price: '',
      description: `${this.translate.instant('BOT_SETTING.QA_DESC_QUESTION')}: ${q.question}\n${this.translate.instant('BOT_SETTING.QA_DESC_ANSWER')}: ${q.answer}`,
      use_case: this.translate.instant('BOT_SETTING.QA_USE_CASE_GENERAL'),
      question: q.question,
      answer: q.answer
    }));

    const products = [...roomItems, ...qaItems];

    if (products.length === 0) {
      this.msg.warning(this.translate.instant('BOT_SETTING.MESSAGES.NEED_DATA'));
      return;
    }
    this.syncing = true;
    try {
      const botContext = this.buildBotContext(val);
      await this.syncAIContext(hotelId, val, botContext);
      this.msg.success(this.translate.instant('BOT_SETTING.MESSAGES.SYNC_SUCCESS'));
    } catch {
      this.msg.error(this.translate.instant('BOT_SETTING.MESSAGES.SYNC_ERROR'));
    } finally {
      this.syncing = false;
    }
  }

  private async syncAIContext(hotelId: string, val: any, botContext?: any): Promise<void> {
    const tenantId = hotelId.toString();
    const resolvedBotContext = botContext || this.buildBotContext(val);
    const roomItems = this.toProducts(val).map(p => ({
      type: 'room',
      name: p.name,
      price: p.price,
      description: [p.description, (p.amenities || []).join(', ')].filter(Boolean).join(' | '),
      use_case: p.use_case || ''
    }));

    const qaItems = (val.questions || []).map((q: any) => ({
      type: 'qa',
      name: 'Q&A',
      price: '',
      description: `${this.translate.instant('BOT_SETTING.QA_DESC_QUESTION')}: ${q.question}\n${this.translate.instant('BOT_SETTING.QA_DESC_ANSWER')}: ${q.answer}`,
      use_case: this.translate.instant('BOT_SETTING.QA_USE_CASE_GENERAL'),
      question: q.question,
      answer: q.answer
    }));

    await this.aiService.uploadDatasetExternal(tenantId, [...roomItems, ...qaItems] as any, resolvedBotContext);
  }
}
