import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'hotel';

  constructor(private translate: TranslateService) {}

  ngOnInit(): void {
    // Set default language from localStorage or use 'vi'
    const savedLang = localStorage.getItem('language') || 'vi';
    this.translate.setDefaultLang('vi');
    this.translate.use(savedLang);
  }
}
