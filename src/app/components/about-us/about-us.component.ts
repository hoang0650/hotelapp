import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-about-us',
  templateUrl: './about-us.component.html',
  styleUrls: ['./about-us.component.css']
})
export class AboutUsComponent implements OnInit {
  coreValues = [
    {
      title: 'Sáng tạo',
      description: 'Luôn đổi mới và sáng tạo trong mọi giải pháp công nghệ, mang đến những trải nghiệm độc đáo cho khách hàng.',
      icon: 'bulb'
    },
    {
      title: 'Chất lượng',
      description: 'Cam kết cung cấp các sản phẩm và dịch vụ chất lượng cao, đáp ứng mọi nhu cầu của khách hàng.',
      icon: 'star'
    },
    {
      title: 'Tin cậy',
      description: 'Xây dựng mối quan hệ lâu dài dựa trên sự tin cậy và minh bạch trong mọi giao dịch.',
      icon: 'safety-certificate'
    },
    {
      title: 'Đổi mới',
      description: 'Không ngừng cập nhật và phát triển công nghệ mới, đi đầu trong xu hướng số hóa ngành khách sạn.',
      icon: 'thunderbolt'
    },
    {
      title: 'Hợp tác',
      description: 'Làm việc chặt chẽ với đối tác và khách hàng để đạt được mục tiêu chung và tạo ra giá trị bền vững.',
      icon: 'team'
    },
    {
      title: 'Phục vụ',
      description: 'Đặt khách hàng làm trung tâm, luôn lắng nghe và phục vụ với tinh thần tận tâm, chuyên nghiệp.',
      icon: 'customer-service'
    }
  ];

  ngOnInit(): void {
    // Initialization logic if needed
  }
}