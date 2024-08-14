import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService, Business } from '../../services/business.service'; 

interface ItemData {
  id: string;
  name: string;
  age: string;
  address: string;
}
@Component({
  selector: 'app-company-management',
  templateUrl: './company-management.component.html',
  styleUrls: ['./company-management.component.css']
})
export class CompanyManagementComponent implements OnInit {
  companyForm: FormGroup;
  businesses: Business[] = [];
  selectedBusiness: Business | null = null;
  newBusiness: Business = {
    name: '',
    address: '',
    tax_code: 0,
    contact: {
      phone: '',
      email: ''
    }
  }; // Khai báo newBusiness

  constructor(private businessService: BusinessService,private fb: FormBuilder) { 
    this.companyForm = this.fb.group({
      name: ['', Validators.required],
      tax_code: [0, Validators.required],
      address: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', Validators.required]
    });
  }
  i = 0;
  editId: string | null = null;
  listOfData: ItemData[] = [];

  startEdit(id: string): void {
    this.editId = id;
  }

  stopEdit(): void {
    this.editId = null;
  }

  addRow(): void {
    this.listOfData = [
      ...this.listOfData,
      {
        id: `${this.i}`,
        name: `Edward King ${this.i}`,
        age: '32',
        address: `London, Park Lane no. ${this.i}`
      }
    ];
    this.i++;
  }

  deleteRow(id: string): void {
    this.listOfData = this.listOfData.filter(d => d.id !== id);
  }

  ngOnInit(): void {
    this.addRow();
    this.addRow();
  }

  // ngOnInit(): void {
  //   this.loadBusinesses();
  // }

  onSubmitCompany(): void {
    if (this.companyForm.valid) {
      // Handle form submission
      console.log(this.companyForm.value);
    }
  }

  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe(
      data => this.businesses = data,
      error => console.error('Error fetching businesses:', error)
    );
  }

  viewBusiness(id: string): void {
    this.businessService.getBusinessById(id).subscribe(
      data => this.selectedBusiness = data,
      error => console.error('Error fetching business:', error)
    );
  }

  createBusiness(): void {
    this.businessService.createBusiness(this.newBusiness).subscribe(
      data => {
        this.businesses.push(data);
        this.newBusiness = { // Reset form after successful creation
          name: '',
          address: '',
          tax_code: 0,
          contact: {
            phone: '',
            email: ''
          }
        };
        this.selectedBusiness = null;
      },
      error => console.error('Error creating business:', error)
    );
  }

  updateBusiness(id: string): void {
    this.businessService.updateBusiness(id, this.selectedBusiness!).subscribe(
      data => {
        const index = this.businesses.findIndex(b => b._id === id);
        if (index !== -1) {
          this.businesses[index] = data;
        }
        this.selectedBusiness = null;
      },
      error => console.error('Error updating business:', error)
    );
  }

  deleteBusiness(id: string): void {
    this.businessService.deleteBusiness(id).subscribe(
      () => {
        this.businesses = this.businesses.filter(b => b._id !== id);
        this.selectedBusiness = null;
      },
      error => console.error('Error deleting business:', error)
    );
  }
}
