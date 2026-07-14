import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/applications', () => ({ createApplication: vi.fn() }));
vi.mock('@/lib/api/modules', () => ({ createModule: vi.fn() }));

import GenerateStoryForm from '../GenerateStoryForm';

const APPS = [{ _id: 'app1', name: 'Practice Admin', initial: 'PPO' }];
const MODULES = [
  { _id: 'mod1', name: 'User Management', applicationId: 'app1' },
];

describe('GenerateStoryForm', () => {
  it('renders story key input and app/module selects', () => {
    render(
      <GenerateStoryForm
        applications={APPS}
        modules={MODULES}
        onApplicationCreated={vi.fn()}
        onModuleCreated={vi.fn()}
        initialStoryKey=''
        onGenerate={vi.fn()}
        aiConfigured
      />,
    );
    expect(screen.getByLabelText(/story key/i)).toBeInTheDocument();
  });

  it('pre-fills story key from initialStoryKey prop', () => {
    render(
      <GenerateStoryForm
        applications={APPS}
        modules={MODULES}
        onApplicationCreated={vi.fn()}
        onModuleCreated={vi.fn()}
        initialStoryKey='PROJ-123'
        onGenerate={vi.fn()}
        aiConfigured
      />,
    );
    expect(screen.getByDisplayValue('PROJ-123')).toBeInTheDocument();
  });

  it('disables Generate button when aiConfigured is false', () => {
    render(
      <GenerateStoryForm
        applications={APPS}
        modules={MODULES}
        onApplicationCreated={vi.fn()}
        onModuleCreated={vi.fn()}
        initialStoryKey=''
        onGenerate={vi.fn()}
        aiConfigured={false}
      />,
    );
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
  });
});
