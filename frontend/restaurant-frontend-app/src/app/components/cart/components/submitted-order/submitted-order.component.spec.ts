import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { Order } from '@app/models/orders/order.model';

import { SubmittedOrderComponent } from './submitted-order.component';

describe('SubmittedOrderComponent', () => {
  let component: SubmittedOrderComponent;
  let fixture: ComponentFixture<SubmittedOrderComponent>;

  const order = {
    orderId: 'order-1',
    status: 1,
    reservationId: 'res-1',
    reservationAddress: 'Test Address',
    reservationTime: '2026-09-08T12:15:00Z',
    orderItems: [
      {
        quantity: 2,
        state: 1,
        dish: {
          id: 'dish-1',
          price: 10,
        },
      },
      {
        quantity: 1,
        state: 2,
        dish: {
          id: 'dish-2',
          price: 100,
        },
      },
    ],
  } as Order;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmittedOrderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(
      SubmittedOrderComponent,
    );

    component = fixture.componentInstance;

    fixture.componentRef.setInput('order', order);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit canceled when cancelOrder is called', () => {
    spyOn(component.canceled, 'emit');

    component.cancelOrder();

    expect(component.canceled.emit).toHaveBeenCalled();
  });

  it('should emit edited when editOrder is called', () => {
    spyOn(component.edited, 'emit');

    component.editOrder();

    expect(component.edited.emit).toHaveBeenCalled();
  });

  it('should exclude rejected items from total price', () => {
    expect(component.totalPrice()).toBe(20);
  });

  describe('a sent group order', () => {
    function buttons(): string[] {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map(
        (button) => button.textContent?.trim() ?? '',
      );
    }

    it('a one-guest order keeps Edit and Cancel', () => {
      expect(buttons()).toEqual(['Cancel Pre-order', 'Edit Pre-order']);
    });

    it('a group order can only be viewed: no Edit or Cancel', () => {
      fixture.componentRef.setInput('isGroup', true);
      fixture.detectChanges();

      expect(buttons()).toEqual(['View Group Pre-Order']);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sent with the group pre-order');
    });

    it('View Group Pre-Order emits viewGroup', () => {
      fixture.componentRef.setInput('isGroup', true);
      fixture.detectChanges();
      let viewed = 0;
      component.viewGroup.subscribe(() => viewed++);

      (fixture.nativeElement as HTMLElement).querySelector('button')!.click();

      expect(viewed).toBe(1);
    });
  });
});
