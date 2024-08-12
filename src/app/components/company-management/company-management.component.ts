import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-company-management',
  templateUrl: './company-management.component.html',
  styleUrls: ['./company-management.component.css']
})
export class CompanyManagementComponent implements OnInit {
  companyForm: FormGroup;
  business = [];

  constructor(private fb: FormBuilder) {
    this.companyForm = this.fb.group({
      name: ['', Validators.required],
      tax_code: [0, Validators.required],
      address: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', Validators.required]
    });
  }

  ngOnInit(): void {}

  onSubmitCompany(): void {
    if (this.companyForm.valid) {
      // Handle form submission
      console.log(this.companyForm.value);
    }
  }
}
