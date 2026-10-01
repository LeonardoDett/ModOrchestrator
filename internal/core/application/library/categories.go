package library

import (
	"context"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// stateCategoriesSeeded marks instances whose tree was seeded with the
// adapter defaults, so deleting every category does not bring them back.
const stateCategoriesSeeded = "library.categoriesSeeded."

// CategoryList returns the category tree of an instance, seeding it with the
// adapter's defaults the first time (core/02 §10; no network).
func (s *Service) CategoryList(ctx context.Context, instance game.InstanceID) ([]mod.Category, error) {
	tree, err := s.categoryTree(ctx, instance)
	if err != nil {
		return nil, err
	}
	return tree.Categories(), nil
}

func (s *Service) categoryTree(ctx context.Context, instance game.InstanceID) (mod.CategoryTree, error) {
	if err := s.seedCategories(ctx, instance); err != nil {
		return mod.CategoryTree{}, err
	}
	cats, err := s.Deps.Categories.List(ctx, instance)
	if err != nil {
		return mod.CategoryTree{}, err
	}
	return mod.NewCategoryTree(cats)
}

func (s *Service) seedCategories(ctx context.Context, instance game.InstanceID) error {
	if _, err := s.State.Get(ctx, stateCategoriesSeeded+string(instance)); err == nil {
		return nil
	} else if !notFound(err) {
		return err
	}
	e, err := s.env(ctx, instance)
	if err != nil {
		return err
	}
	var seeds []ports.DefaultCategory
	if p, ok := e.adapter.(ports.CategoryProvider); ok {
		seeds = p.DefaultCategories(e.inst.Game)
	}
	existing, err := s.Deps.Categories.List(ctx, instance)
	if err != nil {
		return err
	}
	if len(existing) == 0 && len(seeds) > 0 {
		ids := map[string]mod.CategoryID{}
		for _, d := range seeds {
			ids[d.Key] = mod.CategoryID(s.IDs.NewID())
		}
		var cats []mod.Category
		for i, d := range seeds {
			cats = append(cats, mod.Category{ID: ids[d.Key], Instance: instance, Name: d.Name, Parent: ids[d.Parent], Order: i})
		}
		if _, err := mod.NewCategoryTree(cats); err != nil {
			return err
		}
		if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			return tx.Categories().Replace(ctx, instance, cats)
		}); err != nil {
			return err
		}
	}
	return s.State.Set(ctx, stateCategoriesSeeded+string(instance), "true")
}

// CategoryInput creates or edits a category.
type CategoryInput struct {
	ID     mod.CategoryID // empty to create
	Name   string
	Parent mod.CategoryID
	Order  int
}

// SaveCategory creates or updates a category (rename, move).
func (s *Service) SaveCategory(ctx context.Context, instance game.InstanceID, in CategoryInput) (mod.CategoryID, error) {
	if strings.TrimSpace(in.Name) == "" {
		return "", fail(CodeNameEmpty, nil)
	}
	tree, err := s.categoryTree(ctx, instance)
	if err != nil {
		return "", err
	}
	id := in.ID
	if id == "" {
		id = mod.CategoryID(s.IDs.NewID())
	} else if !tree.Has(id) {
		return "", fail(CodeCategoryInvalid, nil, "category", string(id))
	}
	next, err := tree.With(mod.Category{ID: id, Instance: instance, Name: in.Name, Parent: in.Parent, Order: in.Order})
	if err != nil {
		return "", fail(CodeCategoryInvalid, err, "category", string(id))
	}
	return id, s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventCategoryChanged, "category", string(id), "", map[string]string{"name": strings.TrimSpace(in.Name)}))
		return tx.Categories().Replace(ctx, instance, next.Categories())
	})
}

// DeleteCategory removes a category and its descendants; their mods become
// uncategorized (core/02 §10).
func (s *Service) DeleteCategory(ctx context.Context, instance game.InstanceID, id mod.CategoryID) error {
	tree, err := s.categoryTree(ctx, instance)
	if err != nil {
		return err
	}
	if !tree.Has(id) {
		return fail(CodeCategoryInvalid, nil, "category", string(id))
	}
	rest, gone := tree.Without(id)
	removed := map[mod.CategoryID]bool{}
	for _, g := range gone {
		removed[g] = true
	}
	now := s.Clock.Now()
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		mods, err := tx.Mods().ListByInstance(ctx, instance)
		if err != nil {
			return err
		}
		for _, m := range mods {
			if removed[m.Category] && m.State != mod.StateRemoved {
				if err := m.SetCategory("", now); err != nil {
					return err
				}
				if err := tx.Mods().Save(ctx, m); err != nil {
					return err
				}
			}
		}
		tx.Emit(s.newEvent(EventCategoryChanged, "category", string(id), "", map[string]string{"deleted": "true"}))
		return tx.Categories().Replace(ctx, instance, rest.Categories())
	})
}
