import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RoomCategory } from '../../interfaces/rooms';
import { RoomCategoryService } from '../../services/room-category.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-room-category',
  templateUrl: './room-category.component.html',
  styleUrls: ['./room-category.component.css']
})
export class RoomCategoryComponent implements OnInit, OnChanges {
  @Input() hotelId: string = '';

  categories: RoomCategory[] = [];
  categoryForm!: FormGroup;
  editingCategory: RoomCategory | null = null;
  priceConfigId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private categoryService: RoomCategoryService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      pricing: this.fb.group({
        hourly: [0],
        daily: [0],
        nightly: [0],
        weekly: [0],
        monthly: [0]
      }),
      firstHourRate: [0],
      additionalHourRate: [0],
      capacity: this.fb.group({
        adults: [2, [Validators.required, Validators.min(1)]],
        children: [0, [Validators.min(0)]]
      }),
      priceConfig: this.fb.group({
        holidayDates: [''],
        hourlyRates: this.fb.group({
          maxHoursBeforeDay: [6, [Validators.min(1)]],
          gracePeriodMinutes: [15, [Validators.min(0), Validators.max(60)]],
          autoNightlyHours: [8, [Validators.min(1)]]
        }),
        dailyRates: this.fb.group({
          checkInTime: ['12:00'],
          checkOutTime: ['12:00'],
          earlyCheckinSurcharge: [0, [Validators.min(0)]],
          latecheckOutFee: [0, [Validators.min(0)]],
          weekendSurcharge: [0, [Validators.min(0)]],
          holidaySurcharge: [0, [Validators.min(0)]]
        }),
        nightlyRates: this.fb.group({
          startTime: ['20:00'],
          endTime: ['12:00'],
          earlyCheckinSurcharge: [0, [Validators.min(0)]],
          lateCheckoutSurcharge: [0, [Validators.min(0)]],
          autoDailyHours: [24, [Validators.min(1)]],
          weekendSurcharge: [0, [Validators.min(0)]],
          holidaySurcharge: [0, [Validators.min(0)]]
        }),
        updateRooms: [true]
      })
    });
  }

  ngOnInit(): void {
    if (this.hotelId) {
      this.loadCategories();
    }
    this.patchHolidayDatesToForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hotelId'] && this.hotelId) {
      this.loadCategories();
    }
    if (changes['hotelId']) {
      this.patchHolidayDatesToForm();
    }
  }

  loadCategories(): void {
    this.categoryService.getCategories(this.hotelId).subscribe(
      (res: any) => {
        this.categories = res.data || res || [];
      },
      (error) => {
        console.error('Error loading categories:', error);
        this.message.error('Lỗi khi tải danh sách hạng phòng');
      }
    );
  }

  startEdit(category: RoomCategory): void {
    this.editingCategory = category;
    this.priceConfigId = null;
    this.categoryForm.patchValue({
      name: category.name,
      description: category.description || '',
      pricing: {
        hourly: category.pricing?.hourly || 0,
        daily: category.pricing?.daily || 0,
        nightly: category.pricing?.nightly || 0,
        weekly: category.pricing?.weekly || 0,
        monthly: category.pricing?.monthly || 0
      },
      firstHourRate: category.firstHourRate || 0,
      additionalHourRate: category.additionalHourRate || 0,
      capacity: {
        adults: category.capacity?.adults || 2,
        children: category.capacity?.children || 0
      }
    });
    this.patchHolidayDatesToForm();

    if (this.hotelId && category._id) {
      this.categoryService.getPriceConfigByRoomCategory(this.hotelId, category._id).subscribe({
        next: (res: any) => {
          const cfg = res?.data || res;
          if (!cfg || !cfg._id) {
            return;
          }
          this.priceConfigId = cfg._id;
          this.categoryForm.get('priceConfig')?.patchValue({
            hourlyRates: {
              maxHoursBeforeDay: cfg.hourlyRates?.maxHoursBeforeDay ?? 6,
              gracePeriodMinutes: cfg.hourlyRates?.gracePeriodMinutes ?? 15,
              autoNightlyHours: cfg.hourlyRates?.autoNightlyHours ?? 8
            },
            dailyRates: {
              checkInTime: cfg.dailyRates?.checkInTime ?? '12:00',
              checkOutTime: cfg.dailyRates?.checkOutTime ?? '12:00',
              earlyCheckinSurcharge: cfg.dailyRates?.earlyCheckinSurcharge ?? 0,
              latecheckOutFee: cfg.dailyRates?.latecheckOutFee ?? 0,
              weekendSurcharge: cfg.dailyRates?.weekendSurcharge ?? 0,
              holidaySurcharge: cfg.dailyRates?.holidaySurcharge ?? 0
            },
            nightlyRates: {
              startTime: cfg.nightlyRates?.startTime ?? '20:00',
              endTime: cfg.nightlyRates?.endTime ?? '12:00',
              earlyCheckinSurcharge: cfg.nightlyRates?.earlyCheckinSurcharge ?? 0,
              lateCheckoutSurcharge: cfg.nightlyRates?.lateCheckoutSurcharge ?? 0,
              autoDailyHours: cfg.nightlyRates?.autoDailyHours ?? 24,
              weekendSurcharge: cfg.nightlyRates?.weekendSurcharge ?? 0,
              holidaySurcharge: cfg.nightlyRates?.holidaySurcharge ?? 0
            }
          }, { emitEvent: false });
        },
        error: () => {
        }
      });
    }
  }

  cancelEdit(): void {
    this.editingCategory = null;
    this.priceConfigId = null;
    this.categoryForm.reset({
      name: '',
      description: '',
      pricing: { hourly: 0, daily: 0, nightly: 0, weekly: 0, monthly: 0 },
      firstHourRate: 0,
      additionalHourRate: 0,
      capacity: { adults: 2, children: 0 },
      priceConfig: {
        holidayDates: this.loadHolidayDates(),
        hourlyRates: { maxHoursBeforeDay: 6, gracePeriodMinutes: 15, autoNightlyHours: 8 },
        dailyRates: { checkInTime: '12:00', checkOutTime: '12:00', earlyCheckinSurcharge: 0, latecheckOutFee: 0, weekendSurcharge: 0, holidaySurcharge: 0 },
        nightlyRates: { startTime: '20:00', endTime: '12:00', earlyCheckinSurcharge: 0, lateCheckoutSurcharge: 0, autoDailyHours: 24, weekendSurcharge: 0, holidaySurcharge: 0 },
        updateRooms: true
      }
    });
  }

  private getHolidayStorageKey(): string {
    const id = String(this.hotelId || 'default');
    return `phhotel:holidayDates:${id}`;
  }

  private loadHolidayDates(): string {
    try {
      if (typeof window === 'undefined') return '';
      return localStorage.getItem(this.getHolidayStorageKey()) || '';
    } catch {
      return '';
    }
  }

  private saveHolidayDates(value: any): void {
    try {
      if (typeof window === 'undefined') return;
      const v = String(value || '').trim();
      localStorage.setItem(this.getHolidayStorageKey(), v);
    } catch {}
  }

  private patchHolidayDatesToForm(): void {
    const priceConfigGroup = this.categoryForm.get('priceConfig');
    if (!priceConfigGroup) return;
    priceConfigGroup.patchValue({ holidayDates: this.loadHolidayDates() }, { emitEvent: false });
  }

  private buildPriceConfigPayload(roomCategoryId: string, roomTypeName: string, formValue: any): any {
    const pricing = formValue.pricing || {};
    const priceConfig = formValue.priceConfig || {};
    const hourlyRates = priceConfig.hourlyRates || {};
    const dailyRates = priceConfig.dailyRates || {};
    const nightlyRates = priceConfig.nightlyRates || {};

    return {
      roomTypeId: roomTypeName,
      roomCategoryId,
      hourlyRates: {
        firstHourPrice: Number(formValue.firstHourRate) || 0,
        additionalHourPrice: Number(formValue.additionalHourRate) || 0,
        maxHoursBeforeDay: Number(hourlyRates.maxHoursBeforeDay) || 6,
        gracePeriodMinutes: Number(hourlyRates.gracePeriodMinutes) || 15,
        autoNightlyHours: Number(hourlyRates.autoNightlyHours) || 8
      },
      dailyRates: {
        standardPrice: Number(pricing.daily) || 0,
        weekendSurcharge: Number(dailyRates.weekendSurcharge) || 0,
        holidaySurcharge: Number(dailyRates.holidaySurcharge) || 0,
        checkInTime: dailyRates.checkInTime || '12:00',
        checkOutTime: dailyRates.checkOutTime || '12:00',
        earlyCheckinSurcharge: Number(dailyRates.earlyCheckinSurcharge) || 0,
        latecheckOutFee: Number(dailyRates.latecheckOutFee) || 0
      },
      nightlyRates: {
        standardPrice: Number(pricing.nightly) || 0,
        startTime: nightlyRates.startTime || '20:00',
        endTime: nightlyRates.endTime || '12:00',
        weekendSurcharge: Number(nightlyRates.weekendSurcharge) || 0,
        holidaySurcharge: Number(nightlyRates.holidaySurcharge) || 0,
        earlyCheckinSurcharge: Number(nightlyRates.earlyCheckinSurcharge) || 0,
        lateCheckoutSurcharge: Number(nightlyRates.lateCheckoutSurcharge) || 0,
        autoDailyHours: Number(nightlyRates.autoDailyHours) || 24
      },
      updateRooms: priceConfig.updateRooms === true
    };
  }

  submitForm(): void {
    if (this.categoryForm.invalid) {
      Object.values(this.categoryForm.controls).forEach((control: any) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    const formValue = this.categoryForm.value;
    this.saveHolidayDates(formValue?.priceConfig?.holidayDates);
    const categoryData: Partial<RoomCategory> = {
      hotelId: this.hotelId,
      name: formValue.name,
      description: formValue.description,
      pricing: {
        hourly: Number(formValue.pricing?.hourly) || 0,
        daily: Number(formValue.pricing?.daily) || 0,
        nightly: Number(formValue.pricing?.nightly) || 0,
        weekly: Number(formValue.pricing?.weekly) || 0,
        monthly: Number(formValue.pricing?.monthly) || 0
      },
      firstHourRate: Number(formValue.firstHourRate) || 0,
      additionalHourRate: Number(formValue.additionalHourRate) || 0,
      capacity: {
        adults: Number(formValue.capacity?.adults) || 2,
        children: Number(formValue.capacity?.children) || 0
      }
    };

    if (this.editingCategory && this.editingCategory._id) {
      this.categoryService.updateCategory(this.editingCategory._id, categoryData).subscribe(
        (res: any) => {
          const updated = res.data || res;
          const index = this.categories.findIndex(c => c._id === this.editingCategory!._id);
          if (index !== -1) {
            this.categories[index] = updated;
            this.categories = [...this.categories];
          }
          const payload = this.buildPriceConfigPayload(this.editingCategory!._id!, updated.name || formValue.name, formValue);
          const save$ = this.priceConfigId
            ? this.categoryService.updatePriceConfig(this.priceConfigId, payload)
            : this.categoryService.createPriceConfig(this.hotelId, payload);
          save$.subscribe({
            next: (pcRes: any) => {
              const cfg = pcRes?.data || pcRes;
              if (cfg?._id) {
                this.priceConfigId = cfg._id;
              }
              this.message.success('Cập nhật hạng phòng thành công');
              this.cancelEdit();
            },
            error: (error) => {
              this.message.error(error.error?.message || 'Cập nhật cấu hình giá thất bại');
            }
          });
        },
        (error) => {
          console.error('Error updating category:', error);
          this.message.error(error.error?.message || 'Lỗi khi cập nhật hạng phòng');
        }
      );
    } else {
      this.categoryService.createCategory(categoryData).subscribe(
        (res: any) => {
          const newCategory = res.data || res;
          this.categories.push(newCategory);
          this.categories = [...this.categories];
          const payload = this.buildPriceConfigPayload(newCategory._id, newCategory.name || formValue.name, formValue);
          this.categoryService.createPriceConfig(this.hotelId, payload).subscribe({
            next: () => {
              this.message.success('Thêm hạng phòng thành công');
              this.cancelEdit();
            },
            error: (error) => {
              this.message.error(error.error?.message || 'Tạo cấu hình giá thất bại');
            }
          });
        },
        (error) => {
          console.error('Error creating category:', error);
          this.message.error(error.error?.message || 'Lỗi khi thêm hạng phòng');
        }
      );
    }
  }

  deleteCategory(id: string): void {
    this.categoryService.deleteCategory(id).subscribe(
      () => {
        this.categories = this.categories.filter(c => c._id !== id);
        this.message.success('Xóa hạng phòng thành công');
      },
      (error) => {
        console.error('Error deleting category:', error);
        this.message.error(error.error?.message || 'Lỗi khi xóa hạng phòng');
      }
    );
  }
}
