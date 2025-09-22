import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DataPreview } from './DataPreview';
import { FestivalData } from '@/types';

// Mock the UI components that use Tailwind-specific classes
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }) => <div data-testid="card-title">{children}</div>,
  CardContent: ({ children }) => <div data-testid="card-content">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }) => <span>{children}</span>,
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }) => <div>{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
  TabsContent: ({ children }) => <div>{children}</div>,
}));

jest.mock('lucide-react', () => ({
  Edit2: () => <span>Edit</span>,
  Save: () => <span>Save</span>,
  X: () => <span>Cancel</span>,
  Plus: () => <span>Add</span>,
  Trash2: () => <span>Delete</span>,
  MapPin: () => <span>📍</span>,
  Calendar: () => <span>📅</span>,
  Users: () => <span>👥</span>,
  Music: () => <span>🎵</span>,
  DollarSign: () => <span>💰</span>,
}));

jest.mock('@/lib/date-utils', () => ({
  formatDate: (date, format) => {
    if (format === 'yyyy-MM-dd') {
      return date.toISOString().split('T')[0];
    }
    return date.toLocaleDateString();
  },
}));

describe('DataPreview', () => {
  const mockFestivalData: FestivalData = {
    name: 'Test Swing Festival',
    description: 'An amazing swing dance festival',
    website: 'https://testswingfest.com',
    email: 'info@testswingfest.com',
    phone: '+1234567890',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-03'),
    timezone: 'UTC',
    sourceUrl: 'https://testswingfest.com',
    venue: {
      name: 'Swing Dance Hall',
      address: '123 Dance Street',
      city: 'Swing City',
      state: 'SC',
      country: 'Swingland',
      postalCode: '12345',
      latitude: 40.7128,
      longitude: -74.0060,
    },
    teachers: [
      { name: 'John Smith', specialties: ['Lindy Hop', 'Balboa'] },
      { name: 'Jane Doe', specialties: ['Blues', 'Charleston'] },
    ],
    musicians: [
      { name: 'Swing Band', genre: ['Swing', 'Jazz'] },
      { name: 'Blues Collective', genre: ['Blues'] },
    ],
    prices: [
      { type: 'Early Bird', amount: 150, currency: 'USD' },
      { type: 'Regular', amount: 200, currency: 'USD', deadline: new Date('2024-05-15') },
    ],
    tags: ['swing', 'lindy', 'blues', 'dance'],
  };

  const mockOnEdit = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('View Mode', () => {
    it('should render festival data in view mode', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      expect(screen.getByText('Test Swing Festival')).toBeInTheDocument();
      expect(screen.getByText('An amazing swing dance festival')).toBeInTheDocument();
      expect(screen.getByText('Swing Dance Hall')).toBeInTheDocument();
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Swing Band')).toBeInTheDocument();
      expect(screen.getByText('Early Bird')).toBeInTheDocument();
    });

    it('should show Edit button in view mode', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('should call onEdit when Edit button is clicked', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      fireEvent.click(screen.getByText('Edit'));
      expect(mockOnEdit).toHaveBeenCalledWith(mockFestivalData);
    });

    it('should display website as clickable link', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      const websiteLink = screen.getByText('https://testswingfest.com');
      expect(websiteLink).toBeInTheDocument();
      expect(websiteLink.closest('a')).toHaveAttribute('href', 'https://testswingfest.com');
    });

    it('should display email address', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      expect(screen.getByText('info@testswingfest.com')).toBeInTheDocument();
    });

    it('should display phone number', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      expect(screen.getByText('+1234567890')).toBeInTheDocument();
    });

    it('should display source URL as link', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      const sourceLink = screen.getByText('View Source');
      expect(sourceLink).toBeInTheDocument();
      expect(sourceLink.closest('a')).toHaveAttribute('href', 'https://testswingfest.com');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalData: FestivalData = {
        name: 'Minimal Festival',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
      };

      render(
        <DataPreview
          data={minimalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      expect(screen.getByText('Minimal Festival')).toBeInTheDocument();
      expect(screen.getByText('No description provided')).toBeInTheDocument();
      expect(screen.getByText('Not provided')).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('should render input fields in edit mode', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();

      // Check for input fields
      const nameInput = screen.getByDisplayValue('Test Swing Festival');
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.tagName).toBe('INPUT');
    });

    it('should show Save and Cancel buttons in edit mode', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should call onSave when Save button is clicked', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      fireEvent.click(screen.getByText('Save'));
      expect(mockOnSave).toHaveBeenCalled();
    });

    it('should call onCancel when Cancel button is clicked', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      fireEvent.click(screen.getByText('Cancel'));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Tabs Navigation', () => {
    it('should show all tab triggers', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      expect(screen.getByText('Basic Info')).toBeInTheDocument();
      expect(screen.getByText('Venue')).toBeInTheDocument();
      expect(screen.getByText('People')).toBeInTheDocument();
      expect(screen.getByText('Pricing')).toBeInTheDocument();
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });

    it('should allow switching between tabs', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      // Initially on Basic Info tab
      expect(screen.getByText('Test Swing Festival')).toBeInTheDocument();

      // Click on Venue tab
      fireEvent.click(screen.getByText('Venue'));
      expect(screen.getByText('Swing Dance Hall')).toBeInTheDocument();

      // Click on People tab
      fireEvent.click(screen.getByText('People'));
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Swing Band')).toBeInTheDocument();
    });
  });

  describe('Data Editing', () => {
    it('should allow editing festival name', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      const nameInput = screen.getByDisplayValue('Test Swing Festival');
      fireEvent.change(nameInput, { target: { value: 'Updated Festival Name' } });
      expect(nameInput).toHaveValue('Updated Festival Name');
    });

    it('should allow adding new teachers', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      // Switch to People tab
      fireEvent.click(screen.getByText('People'));

      // Find and click Add Teacher button
      const addButton = screen.getByText('Add Teacher');
      fireEvent.click(addButton);

      // Should now have a new empty teacher input
      const teacherInputs = screen.getAllByDisplayValue('');
      expect(teacherInputs.length).toBeGreaterThan(0);
    });

    it('should allow removing teachers', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={true}
        />
      );

      // Switch to People tab
      fireEvent.click(screen.getByText('People'));

      // Find delete button for first teacher
      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons.length).toBeGreaterThan(0);

      // Click first delete button
      fireEvent.click(deleteButtons[0]);
    });

    it('should handle empty arrays gracefully', () => {
      const dataWithoutPeople: FestivalData = {
        ...mockFestivalData,
        teachers: [],
        musicians: [],
        prices: [],
        tags: [],
      };

      render(
        <DataPreview
          data={dataWithoutPeople}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      // Switch to People tab
      fireEvent.click(screen.getByText('People'));

      expect(screen.getByText('No teachers listed')).toBeInTheDocument();
      expect(screen.getByText('No musicians listed')).toBeInTheDocument();

      // Switch to Pricing tab
      fireEvent.click(screen.getByText('Pricing'));
      expect(screen.getByText('No pricing information available')).toBeInTheDocument();

      // Switch to Tags tab
      fireEvent.click(screen.getByText('Tags'));
      expect(screen.getByText('No tags assigned')).toBeInTheDocument();
    });
  });

  describe('Venue Information', () => {
    it('should display complete venue information', () => {
      render(
        <DataPreview
          data={mockFestivalData}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      // Switch to Venue tab
      fireEvent.click(screen.getByText('Venue'));

      expect(screen.getByText('Swing Dance Hall')).toBeInTheDocument();
      expect(screen.getByText('123 Dance Street')).toBeInTheDocument();
      expect(screen.getByText('Swing City')).toBeInTheDocument();
      expect(screen.getByText('SC')).toBeInTheDocument();
      expect(screen.getByText('Swingland')).toBeInTheDocument();
      expect(screen.getByText('12345')).toBeInTheDocument();
    });

    it('should handle missing venue information', () => {
      const dataWithoutVenue: FestivalData = {
        ...mockFestivalData,
        venue: undefined,
      };

      render(
        <DataPreview
          data={dataWithoutVenue}
          onEdit={mockOnEdit}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isEditing={false}
        />
      );

      // Switch to Venue tab
      fireEvent.click(screen.getByText('Venue'));

      expect(screen.getByText('No venue information available')).toBeInTheDocument();
    });
  });
});