import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService } from '../../services/business.service'; 
import { Business } from '../../interfaces/business';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';

@Component({
  selector: 'app-company-management',
  templateUrl: './company-management.component.html',
  styleUrls: ['./company-management.component.css']
})
export class CompanyManagementComponent implements OnInit {
  businessForm: FormGroup;
  businesses: Business[] = [];
  selectedBusiness: Business | null = null;
  availableHotels: Hotel[] = [];

  constructor(private businessService: BusinessService, private hotelService: HotelService, private fb: FormBuilder) { 
    this.businessForm = this.fb.group({
      name: ['', Validators.required],     
      address: ['', Validators.required], 
      tax_code: [0, [Validators.required, Validators.min(1)]],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      hotels: [[]]
    });
  }

  ngOnInit(): void { 
    this.loadBusinesses();
    this.loadHotels();
  }

  editId: string | null = null;
  listOfData: Business[] = [];

  startEdit(id: string): void {
    this.editId = id;
    const businessToEdit = this.businesses.find(b => b._id === id);
    if (businessToEdit) {
      this.selectedBusiness = { ...businessToEdit };
      this.businessForm.patchValue({
        name: this.selectedBusiness.name,
        tax_code: this.selectedBusiness.tax_code,
        address: this.selectedBusiness.address,
        contact: {
          phone: this.selectedBusiness.contact.phone,
          email: this.selectedBusiness.contact.email
        },
        hotels: this.selectedBusiness.hotels || [] // Ensure hotels are patched correctly
      });
    }
  }
  
  stopEdit(): void {
    this.editId = null;
    this.selectedBusiness = null;
    this.businessForm.reset();
  }
 
  loadHotels(): void {
    this.hotelService.getHotels().subscribe(data => {
      this.availableHotels = data;
    });
  }
  
  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe(
      data => {
        this.businesses = data; // Store the fetched businesses
        this.listOfData = data;
      },
      error => console.error('Error fetching businesses:', error)
    );
  }

  createBusiness(): void {
    if (this.businessForm.valid) {
      const newBusiness: Business = this.businessForm.value;

      this.businessService.createBusiness(newBusiness).subscribe(
        (data: Business) => {
          this.businesses.push(data); // Add the new business to the local list
          this.businessForm.reset(); // Reset the form after successful creation
        },
        error => {
          console.error('Error creating business:', error);
        }
      );
    } else {
      console.error('Form is invalid');
    }
  }

  updateBusiness(): void {
    if (this.selectedBusiness && this.businessForm.valid) {
      this.businessService.updateBusiness(this.selectedBusiness._id!, this.businessForm.value).subscribe(() => {
        this.loadBusinesses();
        this.loadHotels();
        this.businessForm.reset();
        this.selectedBusiness = null;
      });
    }
  }

  deleteBusiness(id: string): void {
    this.businessService.deleteBusiness(id).subscribe(
      () => {
        this.listOfData = this.listOfData.filter(d => d._id !== id);
        this.selectedBusiness = null;
      },
      error => console.error('Error deleting business:', error)
    );
  }

}
