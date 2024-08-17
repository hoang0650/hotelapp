import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService } from '../../services/business.service'; 
import { Business } from '../../interfaces/business';
import { log } from 'console';

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
  businessForm: FormGroup;
  businesses: Business[] = [];
  loadbusinesData: Business[] = []
  selectedBusiness: Business | null = null;

  constructor(private businessService: BusinessService,private fb: FormBuilder) { 
    this.businessForm = this.fb.group({
      name: ['', Validators.required],     
      address: ['', Validators.required], 
      tax_code: [0, [Validators.required, Validators.min(1)]],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      })
    });
  }
  i = 0;
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
        phone: this.selectedBusiness.contact.phone,
        email: this.selectedBusiness.contact.email
      });
    }
  }
  

  stopEdit(): void {
    this.editId = null;
    this.selectedBusiness = null;
    this.businessForm.reset();
  }

  addRow(): void {
    const newRow: Business = {
      _id: `${this.i}`, // Temporary ID for display purposes
      name: '',
      tax_code: 0,
      address: '',
      contact: {
        phone: '',
        email: ''
      }
    };
  
    this.businesses.push(newRow);
    this.listOfData = [
      ...this.listOfData,
      {
        _id: `${this.i}`,
        name: newRow.name,
        tax_code: newRow.tax_code,
        address: newRow.address,
        contact:{
          phone: newRow.contact.phone,
          email: newRow.contact.email
        }
      }
    ];
    this.i++;
  }

  

  deleteRow(_id: string): void {
    this.listOfData = this.listOfData.filter(d => d._id !== _id);
  }

  ngOnInit(): void { 
    this.loadBusinesses();
    this.addRow();
  }

  // ngOnInit(): void {
  //   this.loadBusinesses();
  // }

  onSubmitCompany(): void {
    if (this.businessForm.valid) {
      if (this.selectedBusiness && this.selectedBusiness._id) {
        // Update existing business
        this.updateBusiness(this.selectedBusiness._id);
      } else {
        // Create new business
        this.createBusiness();
      }
    }
  }
  

  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe(
      data => {
        this.businesses = data; // Store the fetched businesses
        console.log('businesses',data);
        
        this.listOfData = data.map((business, index) => ({
          _id: business._id || `${index}`, // Ensure there's an ID for each item
          name: business.name,
          tax_code: business.tax_code, // Convert to string for display
          address: business.address,
          contact:{
            phone: business.contact.phone,
            email: business.contact.email
          }
        }));
      },
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
    // Check if the form is valid before proceeding
    if (this.businessForm.valid) {
      // Retrieve the form values
      const newBusiness: Business = this.businessForm.value;
  
      // Call the service method to create the business
      this.businessService.createBusiness(newBusiness).subscribe(
        (data: Business) => {
          console.log('Business created successfully:', data);
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
  

  updateBusiness(id: string): void {
    if (this.businessForm.valid) {
      const updatedBusiness: Business = {
        ...this.selectedBusiness!,
        ...this.businessForm.value,
        contact: {
          phone: this.businessForm.value.phone,
          email: this.businessForm.value.email
        }
      };
      
      this.businessService.updateBusiness(id, updatedBusiness).subscribe(
        (data: Business) => {
          const index = this.businesses.findIndex(b => b._id === id);
          if (index !== -1) {
            this.businesses[index] = data;
            this.listOfData = this.listOfData.map(item =>
              item._id === id ? {
                ...item,
                name: data.name,
                tax_code: data.tax_code,
                address: data.address,
                phone: data.contact.phone,
                email: data.contact.email
              } : item
            );
          }
          this.selectedBusiness = null;
          this.editId = null;
          this.businessForm.reset(); // Reset the form after successful update
        },
        error => console.error('Error updating business:', error)
      );
    } else {
      console.error('Form is invalid');
    }
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
