import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { DishType } from '@app/models/enums/dish-type.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { MenuPageComponent } from './menu-page.component';

describe('MenuPageComponent', () => {
  let component: MenuPageComponent;
  let fixture: ComponentFixture<MenuPageComponent>;
  let navigate: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: 'https://test.api' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
      imports: [MenuPageComponent],
    }).compileComponents();

    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(MenuPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach((request) => request.flush([]));
    fixture.detectChanges();
  });

  function categoryButton(text: string): HTMLButtonElement {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.category-buttons button')].find(
      (button) => button.textContent?.trim() === text,
    )!;
  }

  function lastCategoryParam(): unknown {
    return (navigate.calls.mostRecent().args[1] as { queryParams: Record<string, unknown> }).queryParams['category'];
  }

  it('«All» comes first and is active when no category is chosen', () => {
    const first = (fixture.nativeElement as HTMLElement).querySelector('.category-buttons button')!;
    expect(first.textContent?.trim()).toBe('All');
    expect(first.classList).toContain('active');
  });

  it('a category filters the dishes; «All» shows them all again', () => {
    component.onCategorySelected(DishType.Dessert);
    fixture.detectChanges();
    expect(lastCategoryParam()).toBe(DishType.Dessert);
    expect(categoryButton('All').classList).not.toContain('active');

    categoryButton('All').click();
    fixture.detectChanges();
    expect(lastCategoryParam()).toBeNull();
    expect(categoryButton('All').classList).toContain('active');
  });

  it('clicking the active category again also shows all dishes', () => {
    component.onCategorySelected(DishType.Dessert);
    component.onCategorySelected(DishType.Dessert);
    expect(lastCategoryParam()).toBeNull();
  });
});
