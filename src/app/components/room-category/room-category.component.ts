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
      })
    });
  }

  ngOnInit(): void {
    if (this.hotelId) {
      this.loadCategories();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hotelId'] && this.hotelId) {
      this.loadCategories();
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
  }

  cancelEdit(): void {
    this.editingCategory = null;
    this.categoryForm.reset({
      name: '',
      description: '',
      pricing: { hourly: 0, daily: 0, nightly: 0, weekly: 0, monthly: 0 },
      firstHourRate: 0,
      additionalHourRate: 0,
      capacity: { adults: 2, children: 0 }
    });
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
          this.message.success('Cập nhật hạng phòng thành công');
          this.cancelEdit();
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
          this.message.success('Thêm hạng phòng thành công');
          this.cancelEdit();
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
