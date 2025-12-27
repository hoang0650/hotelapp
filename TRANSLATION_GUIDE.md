# Hướng dẫn Translation cho Tất cả Component

## Tổng quan
Hệ thống sử dụng `@ngx-translate/core` để hỗ trợ đa ngôn ngữ. Khi bấm nút translate trên header, tất cả component sẽ tự động được cập nhật.

## Cấu trúc Translation Files
- `src/assets/i18n/vi.json` - Tiếng Việt
- `src/assets/i18n/en.json` - Tiếng Anh  
- `src/assets/i18n/de.json` - Tiếng Đức

## Cách sử dụng trong Component

### 1. Sử dụng Translate Pipe trong Template (Khuyến nghị)

```html
<!-- Thay vì hardcode text -->
<h1>Quản lý phòng</h1>

<!-- Sử dụng translate pipe -->
<h1>{{ 'ROOM.TITLE' | translate }}</h1>

<!-- Với tham số -->
<p>{{ 'ROOM.WELCOME' | translate: {name: userName} }}</p>
```

### 2. Sử dụng TranslateService trong TypeScript

```typescript
import { TranslateService } from '@ngx-translate/core';

export class MyComponent {
  constructor(private translate: TranslateService) {}

  ngOnInit() {
    // Lấy text đã translate
    const title = this.translate.instant('ROOM.TITLE');
    
    // Lấy text async
    this.translate.get('ROOM.TITLE').subscribe(text => {
      console.log(text);
    });
  }
}
```

### 3. Sử dụng TranslationService (Khuyến nghị cho logic phức tạp)

```typescript
import { TranslationService } from '../../services/translation.service';

export class MyComponent {
  constructor(private translationService: TranslationService) {}

  ngOnInit() {
    // Lắng nghe thay đổi ngôn ngữ
    this.translationService.currentLang$.subscribe(lang => {
      console.log('Current language:', lang);
      // Cập nhật component khi ngôn ngữ thay đổi
    });
  }
}
```

## Thêm Translation Keys

### 1. Thêm vào file vi.json
```json
{
  "ROOM": {
    "TITLE": "Quản lý phòng",
    "WELCOME": "Chào mừng {{name}}",
    "STATUS": {
      "VACANT": "Trống",
      "OCCUPIED": "Đang ở",
      "DIRTY": "Đang bẩn"
    }
  }
}
```

### 2. Thêm vào file en.json
```json
{
  "ROOM": {
    "TITLE": "Room Management",
    "WELCOME": "Welcome {{name}}",
    "STATUS": {
      "VACANT": "Vacant",
      "OCCUPIED": "Occupied",
      "DIRTY": "Dirty"
    }
  }
}
```

### 3. Thêm vào file de.json
```json
{
  "ROOM": {
    "TITLE": "Zimmerverwaltung",
    "WELCOME": "Willkommen {{name}}",
    "STATUS": {
      "VACANT": "Frei",
      "OCCUPIED": "Belegt",
      "DIRTY": "Schmutzig"
    }
  }
}
```

## Checklist để cập nhật Component

- [ ] Import TranslateModule (đã có trong app.module, không cần import lại)
- [ ] Thay thế hardcode text bằng translate pipe: `{{ 'KEY' | translate }}`
- [ ] Thêm translation keys vào tất cả file ngôn ngữ (vi.json, en.json, de.json)
- [ ] Test chuyển đổi ngôn ngữ trên header
- [ ] Đảm bảo tất cả text đều được translate

## Lưu ý

1. **TranslateModule đã được import trong app.module.ts**, tất cả component đều có thể sử dụng translate pipe
2. **Khi switch language trên header**, tất cả component sẽ tự động cập nhật nhờ TranslateService
3. **Sử dụng nested keys** để tổ chức translation tốt hơn (ví dụ: `ROOM.STATUS.VACANT`)
4. **Luôn thêm translation cho tất cả ngôn ngữ** (vi, en, de)

## Ví dụ Component đã được cập nhật

Xem các component sau để tham khảo:
- `header.component.ts` - Sử dụng TranslationService
- `sidebar.component.ts` - Sử dụng translate pipe
- `footer.component.ts` - Sử dụng translate pipe

